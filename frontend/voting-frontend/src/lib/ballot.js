// Builds and submits an anonymous ballot.
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";
import { api } from "./api";

const artifactsFor = (depth) => ({
  wasm: `/semaphore/semaphore-${depth}.wasm`,
  zkey: `/semaphore/semaphore-${depth}.zkey`,
});

export class BallotError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/**
 * Steps (reported through onStep so the screen can show progress):
 *  "verify" - download the voter list and check it matches the blockchain
 *  "prove"  - build the zero-knowledge proof (a few seconds)
 *  "submit" - send it to the relayer, which puts it on the blockchain
 */
export async function castBallot({ electionId, identity, candidateIndex, onStep = () => {} }) {
  onStep("verify");
  const info = await api.getGroup(electionId);
  if (info.phase !== "voting") {
    throw new BallotError(info.phase === "setup" ? "Voting hasn't opened yet." : "Voting is closed.", "VOTING_NOT_OPEN");
  }

  const members = info.members.map((m) => BigInt(m));
  const group = new Group(members);
  // The server sends the list, but the blockchain is the authority. If they disagree,
  // the list was altered, and a proof built from it would be rejected anyway.
  if (group.root.toString() !== info.root) {
    throw new BallotError("The voter list from the server doesn't match the blockchain. Don't vote; report this to the election officer.", "ROOT_MISMATCH");
  }
  if (group.indexOf(identity.commitment) === -1) {
    throw new BallotError("Your voter identity isn't on this election's voter list.", "NOT_REGISTERED");
  }

  onStep("prove");
  const depth = Math.max(group.depth, 1);
  const proof = await generateProof(identity, group, candidateIndex, info.scope, depth, artifactsFor(depth));

  onStep("submit");
  return api.castBallot(electionId, proof);
}
