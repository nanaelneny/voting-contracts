// Proof of concept: anonymous, relayer-submitted votes with Semaphore.
const path = require("path");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { Identity, Group, generateProof } = require("@semaphore-protocol/core");

// Use the proving files from npm instead of downloading them at runtime.
const ARTIFACTS_DIR = path.dirname(require.resolve("@zk-kit/semaphore-artifacts/package.json"));
const artifactsFor = (depth) => ({
  wasm: path.join(ARTIFACTS_DIR, `semaphore-${depth}.wasm`),
  zkey: path.join(ARTIFACTS_DIR, `semaphore-${depth}.zkey`),
});

async function prove(identity, group, candidateId, electionId) {
  const depth = Math.max(group.depth, 1);
  return generateProof(identity, group, candidateId, electionId, depth, artifactsFor(depth));
}

describe("ZkVotingSpike (Semaphore)", function () {
  this.timeout(120_000); // proof generation takes a second or two each

  async function deployFixture() {
    const [admin, relayer] = await ethers.getSigners();

    const poseidon = await ethers.deployContract("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
    const verifier = await ethers.deployContract("SemaphoreVerifier");
    const semaphore = await ethers.deployContract("Semaphore", [await verifier.getAddress()], {
      libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
    });
    const voting = await ethers.deployContract("ZkVotingSpike", [await semaphore.getAddress()]);

    // Three registered voters. Each identity's secret stays in the voter's browser;
    // only the commitment is sent to the admin/contract.
    const voters = [new Identity(), new Identity(), new Identity()];
    const group = new Group(voters.map((v) => v.commitment));

    await voting.createElection(3);
    await voting.addVoters(1, voters.map((v) => v.commitment));
    await voting.open(1);

    return { voting, semaphore, admin, relayer, voters, group };
  }

  it("accepts an anonymous vote submitted by a relayer, not the voter", async function () {
    const { voting, relayer, voters, group } = await loadFixture(deployFixture);
    const proof = await prove(voters[0], group, 2, 1);

    await expect(voting.connect(relayer).vote(1, proof)).to.emit(voting, "AnonymousVote").withArgs(1, 2, proof.nullifier);
    expect(await voting.votes(1, 2)).to.equal(1);
  });

  it("rejects a second vote from the same voter (nullifier reuse)", async function () {
    const { voting, semaphore, relayer, voters, group } = await loadFixture(deployFixture);
    await voting.connect(relayer).vote(1, await prove(voters[1], group, 0, 1));

    const again = await prove(voters[1], group, 1, 1); // different candidate, same voter
    await expect(voting.connect(relayer).vote(1, again)).to.be.revertedWithCustomError(
      semaphore,
      "Semaphore__YouAreUsingTheSameNullifierTwice"
    );
  });

  it("rejects someone who is not a registered voter", async function () {
    const { voting, semaphore, relayer, group } = await loadFixture(deployFixture);
    const outsider = new Identity();
    // The outsider builds their own group including themselves; its root won't match the election's.
    const fakeGroup = new Group([...group.members, outsider.commitment]);
    const proof = await prove(outsider, fakeGroup, 0, 1);
    await expect(voting.connect(relayer).vote(1, proof)).to.be.revertedWithCustomError(
      semaphore,
      "Semaphore__MerkleTreeRootIsNotPartOfTheGroup"
    );
  });

  it("the relayer cannot change which candidate the voter chose", async function () {
    const { voting, semaphore, relayer, voters, group } = await loadFixture(deployFixture);
    const proof = await prove(voters[2], group, 0, 1);
    const tampered = { ...proof, message: "1" };
    await expect(voting.connect(relayer).vote(1, tampered)).to.be.revertedWithCustomError(semaphore, "Semaphore__InvalidProof");
    expect(await voting.votes(1, 1)).to.equal(0);
  });

  it("a proof made for one election cannot be replayed in another", async function () {
    const { voting, relayer, voters, group } = await loadFixture(deployFixture);
    await voting.createElection(3);
    await voting.addVoters(2, voters.map((v) => v.commitment));
    await voting.open(2);

    const proofForElection1 = await prove(voters[0], group, 0, 1);
    await expect(voting.connect(relayer).vote(2, proofForElection1)).to.be.revertedWithCustomError(voting, "WrongScope");
  });

  it("the same voter can vote once in each separate election", async function () {
    const { voting, relayer, voters, group } = await loadFixture(deployFixture);
    await voting.createElection(3);
    await voting.addVoters(2, voters.map((v) => v.commitment));
    await voting.open(2);

    await voting.connect(relayer).vote(1, await prove(voters[0], group, 0, 1));
    await voting.connect(relayer).vote(2, await prove(voters[0], group, 0, 2));
    expect(await voting.votes(2, 0)).to.equal(1);
  });

  it("nothing on-chain links the vote to the voter's identity", async function () {
    const { voting, relayer, voters, group } = await loadFixture(deployFixture);
    const proof = await prove(voters[0], group, 1, 1);
    const receipt = await (await voting.connect(relayer).vote(1, proof)).wait();

    const onChain = JSON.stringify(receipt.logs.map((l) => [l.topics, l.data])) + receipt.from;
    for (const v of voters) {
      const commitmentHex = ethers.toBeHex(v.commitment, 32).slice(2);
      expect(onChain.toLowerCase()).to.not.include(commitmentHex);
    }
    expect(receipt.from).to.equal(relayer.address);
  });
});
