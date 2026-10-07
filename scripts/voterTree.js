// Builds the approved-voter Merkle tree for an election.
// The root goes on-chain (VotingV2.setVoterRoot); each voter needs their proof to vote.
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { getAddress } = require("ethers");

function buildVoterTree(addresses) {
  const unique = [...new Set(addresses.map((a) => getAddress(a)))];
  if (unique.length === 0) throw new Error("Voter list is empty");
  const tree = StandardMerkleTree.of(unique.map((a) => [a]), ["address"]);

  return {
    root: tree.root,
    count: unique.length,
    getProof(address) {
      const target = getAddress(address);
      for (const [i, [a]] of tree.entries()) {
        if (a === target) return tree.getProof(i);
      }
      return null; // not on the list
    },
    // Serializable form, so the backend can store the tree and serve proofs later
    dump: () => tree.dump(),
  };
}

function loadVoterTree(dumped) {
  const tree = StandardMerkleTree.load(dumped);
  return {
    root: tree.root,
    getProof(address) {
      const target = getAddress(address);
      for (const [i, [a]] of tree.entries()) {
        if (a === target) return tree.getProof(i);
      }
      return null;
    },
  };
}

module.exports = { buildVoterTree, loadVoterTree };
