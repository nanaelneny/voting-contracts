// Election logic that spans the database and the blockchain.
const { badRequest, conflict } = require("../errors");

/** Status shown in lists, from the database and the clock (no chain call). */
function electionStatus(election, now) {
  if (election.cancelledAt) return "cancelled";
  if (!election.publishedAt) return election.chainElectionId ? "publishing" : "draft";
  if (now < election.startTime) return "upcoming";
  if (now < election.endTime) return "open";
  return "closed";
}

/** An election can only be edited (details, candidates) before it goes on-chain. */
function assertEditable(election) {
  if (election.cancelledAt) throw conflict("This election was cancelled", "ELECTION_CANCELLED");
  if (election.chainElectionId) throw conflict("This election is already published and can't be changed", "ALREADY_PUBLISHED");
}

function createElectionService({ repo, chain, clock, config }) {
  async function ensureSetupPhase(election) {
    const state = await chain.getElection(election.chainElectionId);
    if (state.phase !== "setup") {
      throw conflict("Voting has already opened on-chain; the election can no longer be changed", "VOTING_STARTED");
    }
    return state;
  }

  /**
   * Push approved, not-yet-added voters into the election's Semaphore group.
   * Safe to repeat: commitments already in the group are just marked as added.
   */
  async function syncVoters(election) {
    if (!election.chainElectionId) throw conflict("Publish the election first", "NOT_PUBLISHED");
    const state = await ensureSetupPhase(election);
    const pending = await repo.listApprovedOffChain(election.id);

    const toAdd = [];
    for (const reg of pending) {
      const index = await chain.memberIndex(state.groupId, reg.commitment);
      if (index === null) toAdd.push(reg);
      else await repo.markRegistrationsOnChain([{ id: reg.id, groupIndex: index }]);
    }

    const base = state.voterCount;
    await chain.addVoters(
      election.chainElectionId,
      toAdd.map((r) => r.commitment),
      async (offset, batch) => {
        await repo.markRegistrationsOnChain(batch.map((_, i) => ({ id: toAdd[offset + i].id, groupIndex: base + offset + i })));
      }
    );
    return { added: toAdd.length, voterCount: base + toAdd.length };
  }

  /**
   * Create the election on-chain with its candidates and approved voters.
   * If a previous attempt stopped halfway, this resumes it.
   */
  async function publish(election) {
    if (election.cancelledAt) throw conflict("This election was cancelled", "ELECTION_CANCELLED");
    if (election.publishedAt) throw conflict("This election is already published", "ALREADY_PUBLISHED");

    const candidates = await repo.listCandidates(election.id);
    if (candidates.length === 0) throw badRequest("Add at least one candidate before publishing", "NO_CANDIDATES");

    let chainElectionId = election.chainElectionId;
    if (!chainElectionId) {
      const now = await clock();
      const earliest = new Date(now.getTime() + config.minPublishLeadSeconds * 1000);
      if (election.startTime < earliest) {
        throw badRequest(
          `Voting must start at least ${Math.ceil(config.minPublishLeadSeconds / 60)} minute(s) after publishing. Move the start time later.`,
          "START_TOO_SOON"
        );
      }
      chainElectionId = await chain.createElection({
        title: election.title,
        offchainId: election.id,
        startTime: election.startTime,
        endTime: election.endTime,
      });
      await repo.setElectionChainId(election.id, chainElectionId);
      election = { ...election, chainElectionId };
    }

    const state = await ensureSetupPhase(election);
    const missing = candidates.slice(state.candidateCount);
    await chain.addCandidates(chainElectionId, missing.map((c) => c.name));
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].chainIndex !== i) await repo.setCandidateChainIndex(candidates[i].id, i);
    }

    const { added } = await syncVoters(election);
    await repo.markElectionPublished(election.id);
    return { chainElectionId, candidates: candidates.length, votersAdded: added };
  }

  async function cancel(election) {
    if (election.cancelledAt) throw conflict("This election is already cancelled", "ELECTION_CANCELLED");
    if (election.chainElectionId) {
      await ensureSetupPhase(election);
      await chain.cancelElection(election.chainElectionId);
    }
    await repo.markElectionCancelled(election.id);
  }

  /** Results straight from the blockchain, with candidate details from the database. */
  async function results(election) {
    const candidates = await repo.listCandidates(election.id);
    if (!election.chainElectionId) {
      return {
        electionId: election.id, phase: election.cancelledAt ? "cancelled" : "draft", totalVotes: 0, voterCount: 0,
        turnout: null, winners: null, tie: false,
        candidates: candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, votes: 0 })),
      };
    }

    const [state, onChain] = await Promise.all([chain.getElection(election.chainElectionId), chain.getCandidates(election.chainElectionId)]);
    const byIndex = new Map(candidates.map((c) => [c.chainIndex, c]));
    const rows = onChain.map((c, i) => ({
      id: byIndex.get(i)?.id ?? null, name: c.name, party: byIndex.get(i)?.party ?? null, votes: c.voteCount,
    }));

    let winners = null;
    if (state.phase === "finalized") {
      winners = (await chain.getWinners(election.chainElectionId)).map((i) => rows[i].id);
    }

    return {
      electionId: election.id,
      chainElectionId: election.chainElectionId,
      phase: state.phase,
      startTime: state.startTime,
      endTime: state.endTime,
      totalVotes: state.totalVotes,
      voterCount: state.voterCount,
      turnout: state.voterCount ? Math.round((state.totalVotes / state.voterCount) * 1000) / 10 : null,
      candidates: rows,
      winners,
      tie: Array.isArray(winners) && winners.length > 1,
    };
  }

  return { electionStatus, assertEditable, publish, syncVoters, cancel, results };
}

module.exports = { createElectionService, electionStatus, assertEditable };
