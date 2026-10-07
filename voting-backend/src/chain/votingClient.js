// Talks to the VotingV2 contract. Two accounts are involved:
//   admin   - owns the contract; creates elections, adds candidates and voters
//   relayer - pays gas to submit voters' anonymous ballots (and finalize)
// They can be the same key in local testing, but keeping them separate means
// the hot key on the server (relayer) can't change elections.
const { Contract, Interface } = require("ethers");

const PHASES = ["setup", "voting", "ended", "finalized", "cancelled"];

// Errors raised inside Semaphore/LeanIMT bubble up through VotingV2; listing them
// here lets us decode them into readable codes.
const EXTRA_ERRORS = [
  "error Semaphore__GroupHasNoMembers()",
  "error Semaphore__MerkleTreeDepthIsNotSupported()",
  "error Semaphore__MerkleTreeRootIsExpired()",
  "error Semaphore__MerkleTreeRootIsNotPartOfTheGroup()",
  "error Semaphore__YouAreUsingTheSameNullifierTwice()",
  "error Semaphore__InvalidProof()",
  "error Semaphore__CallerIsNotTheGroupAdmin()",
  "error LeafGreaterThanSnarkScalarField()",
  "error LeafCannotBeZero()",
  "error LeafAlreadyExists()",
];

const SEMAPHORE_ABI = [
  "function getMerkleTreeRoot(uint256 groupId) view returns (uint256)",
  "function hasMember(uint256 groupId, uint256 identityCommitment) view returns (bool)",
  "function indexOf(uint256 groupId, uint256 identityCommitment) view returns (uint256)",
];

/** A transaction the contract refused (would revert). `code` is the Solidity error name. */
class ChainRejection extends Error {
  constructor(code, args = []) {
    super(`Contract rejected the transaction: ${code}`);
    this.code = code;
    this.args = args;
  }
}

function decodeRevert(iface, err) {
  const candidates = [err?.revert, err?.error?.revert, err?.info?.error?.revert];
  for (const r of candidates) if (r?.name) return new ChainRejection(r.name, [...(r.args || [])]);

  const data = err?.data ?? err?.error?.data ?? err?.info?.error?.data;
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return new ChainRejection(parsed.name, [...parsed.args]);
    } catch (_) { /* unknown error selector */ }
  }
  if (err?.code === "CALL_EXCEPTION") return new ChainRejection(err.reason || "UnknownRevert");
  return null;
}

/** Runs async jobs one at a time (avoids nonce clashes when sending from one account). */
function createQueue() {
  let last = Promise.resolve();
  return (job) => {
    const run = last.then(job);
    last = run.catch(() => {});
    return run;
  };
}

const toSeconds = (date) => Math.floor(new Date(date).getTime() / 1000);

function createVotingClient({ address, abi, adminSigner, relayerSigner, voterBatchSize = 100 }) {
  const iface = new Interface([...abi, ...EXTRA_ERRORS]);
  const reader = new Contract(address, iface, relayerSigner);
  const admin = reader.connect(adminSigner);
  const relayer = reader.connect(relayerSigner);
  const adminQueue = createQueue();
  const relayQueue = createQueue();
  let semaphorePromise;

  // Simulate first (so a doomed transaction costs no gas), then send and wait for it.
  async function send(contract, method, args, queue) {
    let gas;
    try {
      gas = await contract[method].estimateGas(...args);
    } catch (err) {
      throw decodeRevert(iface, err) || err;
    }
    const tx = await queue(() => contract[method](...args, { gasLimit: (gas * 12n) / 10n }));
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new ChainRejection("RevertedOnChain");
    return receipt;
  }

  const semaphore = () =>
    (semaphorePromise ||= reader.semaphore().then((a) => new Contract(a, SEMAPHORE_ABI, relayerSigner)));

  return {
    address,
    PHASES,

    // ── Reads ──
    async getElection(chainId) {
      const e = await reader.getElection(chainId);
      return {
        title: e.title,
        offchainId: Number(e.offchainId),
        startTime: new Date(Number(e.startTime) * 1000),
        endTime: new Date(Number(e.endTime) * 1000),
        groupId: e.groupId.toString(),
        candidateCount: Number(e.candidateCount),
        voterCount: Number(e.voterCount),
        totalVotes: Number(e.totalVotes),
        phase: PHASES[Number(await reader.phase(chainId))],
      };
    },
    async getCandidates(chainId) {
      return (await reader.getCandidates(chainId)).map((c) => ({ name: c.name, voteCount: Number(c.voteCount) }));
    },
    async getWinners(chainId) {
      return (await reader.getWinners(chainId)).map(Number);
    },
    async scopeOf(chainId) {
      return (await reader.scopeOf(chainId)).toString();
    },
    async getGroupRoot(groupId) {
      return (await (await semaphore()).getMerkleTreeRoot(groupId)).toString();
    },
    /** Position of a commitment in the group, or null if it isn't a member. */
    async memberIndex(groupId, commitment) {
      const s = await semaphore();
      if (!(await s.hasMember(groupId, BigInt(commitment)))) return null;
      return Number(await s.indexOf(groupId, BigInt(commitment)));
    },

    // ── Admin transactions ──
    async createElection({ title, offchainId, startTime, endTime }) {
      return adminQueue(async () => {
        const receipt = await send(admin, "createElection", [title, offchainId, toSeconds(startTime), toSeconds(endTime)], (f) => f());
        const event = receipt.logs.map((l) => { try { return iface.parseLog(l); } catch { return null; } })
          .find((p) => p?.name === "ElectionCreated");
        return Number(event.args.electionId);
      });
    },
    async addCandidates(chainId, names) {
      if (names.length === 0) return;
      await adminQueue(() => send(admin, "addCandidates", [chainId, names], (f) => f()));
    },
    /** Adds commitments in batches, in order. Calls onBatch(startIndex, batch) after each batch lands. */
    async addVoters(chainId, commitments, onBatch = async () => {}) {
      for (let i = 0; i < commitments.length; i += voterBatchSize) {
        const batch = commitments.slice(i, i + voterBatchSize);
        await adminQueue(() => send(admin, "addVoters", [chainId, batch.map(BigInt)], (f) => f()));
        await onBatch(i, batch);
      }
    },
    async cancelElection(chainId) {
      await adminQueue(() => send(admin, "cancelElection", [chainId], (f) => f()));
    },

    // ── Relayer transactions ──
    async relayVote(chainId, proof) {
      const receipt = await send(relayer, "vote", [chainId, proof], relayQueue);
      return { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString(), blockNumber: receipt.blockNumber };
    },
    async finalize(chainId) {
      const receipt = await send(relayer, "finalize", [chainId], relayQueue);
      return { txHash: receipt.hash, gasUsed: receipt.gasUsed.toString() };
    },
  };
}

module.exports = { createVotingClient, ChainRejection, PHASES };
