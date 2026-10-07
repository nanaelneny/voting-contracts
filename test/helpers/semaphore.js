// Shared helpers: deploy the Semaphore stack locally and build vote proofs.
const path = require("path");
const { ethers } = require("hardhat");
const { generateProof } = require("@semaphore-protocol/core");

// Proving files from npm, so tests run offline (the browser downloads them instead).
const ARTIFACTS_DIR = path.dirname(require.resolve("@zk-kit/semaphore-artifacts/package.json"));

async function deploySemaphore() {
  const poseidon = await ethers.deployContract("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
  const verifier = await ethers.deployContract("SemaphoreVerifier");
  return ethers.deployContract("Semaphore", [await verifier.getAddress()], {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
  });
}

/** Proof that `identity` (a member of `group`) votes for `candidateId` under `scope`. */
async function proveVote(identity, group, candidateId, scope) {
  const depth = Math.max(group.depth, 1);
  return generateProof(identity, group, candidateId, scope, depth, {
    wasm: path.join(ARTIFACTS_DIR, `semaphore-${depth}.wasm`),
    zkey: path.join(ARTIFACTS_DIR, `semaphore-${depth}.zkey`),
  });
}

module.exports = { deploySemaphore, proveVote };
