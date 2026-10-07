// The relayer: submits voters' anonymous ballots and pays the gas.
//
// Privacy rules for this file:
//  - It never receives or stores who the voter is (no login, no user id).
//  - The relay log records only what's needed for performance evaluation:
//    election, tx hash, outcome, gas and latency. No IP address, no proof.
const { HttpError, badRequest, notFound, conflict } = require("../errors");
const { ChainRejection, PHASES } = require("../chain/votingClient");

const UINT = /^[0-9]{1,78}$/;

/** Checks the proof's shape and converts it to the form the contract expects. */
function parseProof(body) {
  const p = body && body.proof;
  if (!p || typeof p !== "object") throw badRequest("Missing proof", "BAD_PROOF");
  const fields = ["merkleTreeDepth", "merkleTreeRoot", "nullifier", "message", "scope"];
  const out = {};
  for (const f of fields) {
    const v = String(p[f] ?? "");
    if (!UINT.test(v)) throw badRequest(`Proof field "${f}" must be a non-negative integer`, "BAD_PROOF");
    out[f] = BigInt(v);
  }
  if (!Array.isArray(p.points) || p.points.length !== 8 || !p.points.every((x) => UINT.test(String(x)))) {
    throw badRequest('Proof field "points" must be a list of 8 integers', "BAD_PROOF");
  }
  out.points = p.points.map((x) => BigInt(x));
  return out;
}

/** Turns a contract rejection into an HTTP error a voter can understand. */
function toHttpError(rej) {
  switch (rej.code) {
    case "AlreadyVoted":
    case "Semaphore__YouAreUsingTheSameNullifierTwice":
      return conflict("A vote has already been cast with this voter identity in this election", "ALREADY_VOTED");
    case "Semaphore__MerkleTreeRootIsNotPartOfTheGroup":
    case "Semaphore__MerkleTreeRootIsExpired":
      return new HttpError(403, "This proof is not from a registered voter of this election", "NOT_REGISTERED");
    case "Semaphore__InvalidProof":
    case "Semaphore__MerkleTreeDepthIsNotSupported":
      return badRequest("The vote proof is invalid", "INVALID_PROOF");
    case "WrongScope":
      return badRequest("This proof was made for a different election", "WRONG_ELECTION");
    case "InvalidCandidate":
      return badRequest("That candidate doesn't exist in this election", "INVALID_CANDIDATE");
    case "WrongPhase": {
      const phase = PHASES[Number(rej.args[1])];
      const msg = phase === "setup" ? "Voting hasn't opened yet" : `Voting is not open (election is ${phase})`;
      return conflict(msg, "VOTING_NOT_OPEN");
    }
    case "NoCandidates":
    case "NoVoterList":
      return conflict("This election isn't ready for voting", "ELECTION_NOT_READY");
    default:
      return new HttpError(502, "The blockchain rejected the vote", "RELAY_REJECTED");
  }
}

function createRelayService({ repo, chain }) {
  // Nullifiers currently being submitted, so the same ballot sent twice at once
  // doesn't make the relayer pay for a transaction that is bound to fail.
  const inFlight = new Set();

  async function relayVote(electionId, body) {
    const started = Date.now();
    const proof = parseProof(body);

    const election = await repo.getElection(electionId);
    if (!election || !election.publishedAt || election.cancelledAt) throw notFound("Election not found or not open for voting");

    const key = `${election.chainElectionId}:${proof.nullifier}`;
    if (inFlight.has(key)) throw conflict("This vote is already being submitted", "ALREADY_SUBMITTING");
    inFlight.add(key);

    const log = { kind: "vote", chainElectionId: election.chainElectionId };
    try {
      const result = await chain.relayVote(election.chainElectionId, proof);
      await repo.logRelay({ ...log, txHash: result.txHash, status: "success", gasUsed: result.gasUsed, latencyMs: Date.now() - started });
      return result;
    } catch (err) {
      if (err instanceof ChainRejection) {
        await repo.logRelay({ ...log, status: "rejected", errorCode: err.code, latencyMs: Date.now() - started });
        throw toHttpError(err);
      }
      await repo.logRelay({ ...log, status: "failed", errorCode: err.code ? String(err.code) : "ERROR", latencyMs: Date.now() - started });
      throw err;
    } finally {
      inFlight.delete(key);
    }
  }

  async function finalize(election) {
    const started = Date.now();
    if (!election.chainElectionId) throw conflict("This election was never published", "NOT_PUBLISHED");
    try {
      const result = await chain.finalize(election.chainElectionId);
      await repo.logRelay({ kind: "finalize", chainElectionId: election.chainElectionId, txHash: result.txHash, status: "success", gasUsed: result.gasUsed, latencyMs: Date.now() - started });
      return result;
    } catch (err) {
      if (err instanceof ChainRejection && err.code === "WrongPhase") {
        const phase = PHASES[Number(err.args[1])];
        throw conflict(
          phase === "finalized" ? "Results are already finalized" : `Results can only be finalized after voting closes (election is ${phase})`,
          "CANNOT_FINALIZE"
        );
      }
      throw err;
    }
  }

  return { relayVote, finalize };
}

module.exports = { createRelayService, parseProof };
