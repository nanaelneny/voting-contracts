const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { Identity, Group } = require("@semaphore-protocol/core");
const { deploySemaphore, proveVote } = require("./helpers/semaphore");

const Phase = { Setup: 0, Voting: 1, Ended: 2, Finalized: 3, Cancelled: 4 };
const HOUR = 3600;

// A structurally valid but meaningless proof, for checks that fail before proof verification.
const DUMMY_PROOF = { merkleTreeDepth: 1, merkleTreeRoot: 0, nullifier: 0, message: 0, scope: 0, points: Array(8).fill(0) };

describe("VotingV2 (anonymous, Semaphore)", function () {
  this.timeout(180_000); // each proof takes ~0.5s to generate

  async function deployFixture() {
    const [admin, relayer, stranger] = await ethers.getSigners();
    const semaphore = await deploySemaphore();
    const voting = await ethers.deployContract("VotingV2", [admin.address, await semaphore.getAddress()]);
    return { voting, semaphore, admin, relayer, stranger };
  }

  // Election 1: 3 candidates, 3 registered voters (alice, bob, carol); still in Setup.
  async function electionFixture() {
    const base = await deployFixture();
    const { voting } = base;
    const now = await time.latest();
    const start = now + HOUR;
    const end = start + 2 * HOUR;

    await voting.createElection("SRC Elections 2026", 3, start, end);
    await voting.addCandidates(1, ["Isaac", "Gloria", "Rachael"]);

    // In the real app each identity is created in the voter's browser and only
    // the commitment is sent to the admin.
    const [alice, bob, carol] = [new Identity(), new Identity(), new Identity()];
    const group = new Group([alice.commitment, bob.commitment, carol.commitment]);
    await voting.addVoters(1, group.members);

    const scope = await voting.scopeOf(1);
    const prove = (identity, candidateId, s = scope, g = group) => proveVote(identity, g, candidateId, s);

    return { ...base, alice, bob, carol, group, scope, prove, start, end };
  }

  async function openFixture() {
    const f = await electionFixture();
    await time.increaseTo(f.start);
    return f;
  }

  describe("Election setup", function () {
    it("creates elections with sequential ids, each with its own Semaphore group", async function () {
      const { voting } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(voting.createElection("A", 10, now + HOUR, now + 2 * HOUR)).to.emit(voting, "ElectionCreated");
      await voting.createElection("B", 11, now + HOUR, now + 2 * HOUR);

      expect(await voting.electionCount()).to.equal(2);
      const [a, b] = [await voting.getElection(1), await voting.getElection(2)];
      expect(b.offchainId).to.equal(11);
      expect(a.groupId).to.not.equal(b.groupId);
    });

    it("rejects bad time windows and empty titles", async function () {
      const { voting } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(voting.createElection("A", 1, now - 10, now + HOUR)).to.be.revertedWithCustomError(voting, "InvalidTimes");
      await expect(voting.createElection("A", 1, now + 2 * HOUR, now + HOUR)).to.be.revertedWithCustomError(voting, "InvalidTimes");
      await expect(voting.createElection("", 1, now + HOUR, now + 2 * HOUR)).to.be.revertedWithCustomError(voting, "EmptyName");
    });

    it("keeps candidates separate per election", async function () {
      const { voting } = await loadFixture(electionFixture);
      const now = await time.latest();
      await voting.createElection("Other", 7, now + HOUR, now + 2 * HOUR);
      await voting.addCandidate(2, "Kofi");

      expect((await voting.getCandidates(1)).map((c) => c.name)).to.deep.equal(["Isaac", "Gloria", "Rachael"]);
      expect((await voting.getCandidates(2)).map((c) => c.name)).to.deep.equal(["Kofi"]);
    });

    it("rejects empty candidate names and caps the candidate count", async function () {
      const { voting } = await loadFixture(electionFixture);
      await expect(voting.addCandidate(1, "")).to.be.revertedWithCustomError(voting, "EmptyName");
      await voting.addCandidates(1, Array.from({ length: 47 }, (_, i) => `C${i}`)); // 3 + 47 = 50
      await expect(voting.addCandidate(1, "One too many")).to.be.revertedWithCustomError(voting, "TooManyCandidates");
    });

    it("counts registered voters and rejects empty or duplicate registrations", async function () {
      const { voting, alice } = await loadFixture(electionFixture);
      expect((await voting.getElection(1)).voterCount).to.equal(3);

      await expect(voting.addVoters(1, [])).to.be.revertedWithCustomError(voting, "NoVoterList");
      await expect(voting.addVoters(1, [alice.commitment])).to.be.reverted; // already in the group

      await expect(voting.addVoters(1, [new Identity().commitment]))
        .to.emit(voting, "VotersAdded")
        .withArgs(1, 1, 4);
    });

    it("reverts for elections that do not exist", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.getElection(0)).to.be.revertedWithCustomError(voting, "ElectionNotFound");
      await expect(voting.getCandidates(1)).to.be.revertedWithCustomError(voting, "ElectionNotFound");
      await expect(voting.vote(1, DUMMY_PROOF)).to.be.revertedWithCustomError(voting, "ElectionNotFound");
    });
  });

  describe("Access control", function () {
    it("only the admin can create and configure elections", async function () {
      const { voting, stranger } = await loadFixture(electionFixture);
      const now = await time.latest();
      const v = voting.connect(stranger);
      const err = "OwnableUnauthorizedAccount";
      await expect(v.createElection("X", 1, now + HOUR, now + 2 * HOUR)).to.be.revertedWithCustomError(voting, err);
      await expect(v.addCandidate(1, "Me")).to.be.revertedWithCustomError(voting, err);
      await expect(v.addVoters(1, [new Identity().commitment])).to.be.revertedWithCustomError(voting, err);
      await expect(v.cancelElection(1)).to.be.revertedWithCustomError(voting, err);
    });

    it("nobody but the contract can add members to the election's Semaphore group", async function () {
      const { voting, semaphore, stranger } = await loadFixture(electionFixture);
      const { groupId } = await voting.getElection(1);
      await expect(semaphore.connect(stranger).addMember(groupId, new Identity().commitment)).to.be.reverted;
    });
  });

  describe("Lifecycle locks", function () {
    it("moves through Setup -> Voting -> Ended -> Finalized on its own schedule", async function () {
      const { voting, start, end } = await loadFixture(electionFixture);
      expect(await voting.phase(1)).to.equal(Phase.Setup);
      await time.increaseTo(start);
      expect(await voting.phase(1)).to.equal(Phase.Voting);
      await time.increaseTo(end);
      expect(await voting.phase(1)).to.equal(Phase.Ended);
      await voting.finalize(1);
      expect(await voting.phase(1)).to.equal(Phase.Finalized);
    });

    it("admin cannot change candidates or the voter list once voting opens", async function () {
      const { voting } = await loadFixture(openFixture);
      await expect(voting.addCandidate(1, "Late")).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Voting);
      await expect(voting.addVoters(1, [new Identity().commitment])).to.be.revertedWithCustomError(voting, "WrongPhase");
      await expect(voting.cancelElection(1)).to.be.revertedWithCustomError(voting, "WrongPhase");
    });

    it("cannot finalize before voting closes", async function () {
      const { voting } = await loadFixture(openFixture);
      await expect(voting.finalize(1)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Voting);
    });

    it("a cancelled election cannot be voted in or finalized", async function () {
      const { voting, relayer, alice, prove, start, end } = await loadFixture(electionFixture);
      await expect(voting.cancelElection(1)).to.emit(voting, "ElectionCancelled").withArgs(1);
      await time.increaseTo(start);
      expect(await voting.phase(1)).to.equal(Phase.Cancelled);
      await expect(voting.connect(relayer).vote(1, await prove(alice, 0))).to.be.revertedWithCustomError(voting, "WrongPhase");
      await time.increaseTo(end);
      await expect(voting.finalize(1)).to.be.revertedWithCustomError(voting, "WrongPhase");
    });
  });

  describe("Anonymous voting", function () {
    it("accepts a registered voter's proof submitted by a relayer and tallies it", async function () {
      const { voting, relayer, alice, prove } = await loadFixture(openFixture);
      const proof = await prove(alice, 1);

      await expect(voting.connect(relayer).vote(1, proof)).to.emit(voting, "VoteCast").withArgs(1, 1, proof.nullifier);
      expect((await voting.getCandidates(1))[1].voteCount).to.equal(1);
      expect((await voting.getElection(1)).totalVotes).to.equal(1);
      expect(await voting.nullifierUsed(1, proof.nullifier)).to.equal(true);
    });

    it("blocks a second vote from the same voter, even for a different candidate", async function () {
      const { voting, relayer, bob, prove } = await loadFixture(openFixture);
      await voting.connect(relayer).vote(1, await prove(bob, 0));
      await expect(voting.connect(relayer).vote(1, await prove(bob, 2))).to.be.revertedWithCustomError(voting, "AlreadyVoted");
    });

    it("blocks someone who is not a registered voter", async function () {
      const { voting, semaphore, relayer, group, prove } = await loadFixture(openFixture);
      const outsider = new Identity();
      const fakeGroup = new Group([...group.members, outsider.commitment]);
      const proof = await prove(outsider, 0, undefined, fakeGroup);
      await expect(voting.connect(relayer).vote(1, proof)).to.be.revertedWithCustomError(
        semaphore,
        "Semaphore__MerkleTreeRootIsNotPartOfTheGroup"
      );
    });

    it("the relayer cannot change the voter's chosen candidate", async function () {
      const { voting, semaphore, relayer, carol, prove } = await loadFixture(openFixture);
      const tampered = { ...(await prove(carol, 0)), message: "1" };
      await expect(voting.connect(relayer).vote(1, tampered)).to.be.revertedWithCustomError(semaphore, "Semaphore__InvalidProof");
      expect((await voting.getElection(1)).totalVotes).to.equal(0);
    });

    it("rejects invalid candidate ids", async function () {
      const { voting, relayer, alice, prove } = await loadFixture(openFixture);
      await expect(voting.connect(relayer).vote(1, await prove(alice, 3)))
        .to.be.revertedWithCustomError(voting, "InvalidCandidate")
        .withArgs(3);
    });

    it("rejects a proof made for a different election (replay)", async function () {
      const { voting, relayer, alice, group, start } = await loadFixture(electionFixture);
      await voting.createElection("Second", 9, start - 10, start + HOUR);
      await voting.addCandidate(2, "Kofi");
      await voting.addVoters(2, group.members);
      await time.increaseTo(start);

      const forElection1 = await proveVote(alice, group, 0, await voting.scopeOf(1));
      await expect(voting.connect(relayer).vote(2, forElection1)).to.be.revertedWithCustomError(voting, "WrongScope");
    });

    it("the same voter votes once in each election, with unlinkable nullifiers", async function () {
      const { voting, relayer, alice, group, start } = await loadFixture(electionFixture);
      await voting.createElection("Second", 9, start - 10, start + HOUR);
      await voting.addCandidate(2, "Kofi");
      await voting.addVoters(2, group.members);
      await time.increaseTo(start);

      const p1 = await proveVote(alice, group, 0, await voting.scopeOf(1));
      const p2 = await proveVote(alice, group, 0, await voting.scopeOf(2));
      await voting.connect(relayer).vote(1, p1);
      await voting.connect(relayer).vote(2, p2);

      expect(p1.nullifier).to.not.equal(p2.nullifier);
      expect((await voting.getCandidates(2))[0].voteCount).to.equal(1);
    });

    it("works no matter which account submits, and records nothing that identifies the voter", async function () {
      const { voting, stranger, alice, bob, carol, prove } = await loadFixture(openFixture);
      const receipt = await (await voting.connect(stranger).vote(1, await prove(alice, 2))).wait();

      const onChain = (JSON.stringify(receipt.logs.map((l) => [l.topics, l.data])) + receipt.from).toLowerCase();
      for (const id of [alice, bob, carol]) {
        expect(onChain).to.not.include(ethers.toBeHex(id.commitment, 32).slice(2));
      }
      expect(receipt.from).to.equal(stranger.address);
    });

    it("rejects votes before opening and after closing", async function () {
      const { voting, relayer, alice, prove, end } = await loadFixture(electionFixture);
      const proof = await prove(alice, 0);
      await expect(voting.connect(relayer).vote(1, proof)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Setup);
      await time.increaseTo(end);
      await expect(voting.connect(relayer).vote(1, proof)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Ended);
    });

    it("refuses votes in an election opened without candidates or voters", async function () {
      const { voting } = await loadFixture(deployFixture);
      const now = await time.latest();
      await voting.createElection("Empty", 1, now + 100, now + HOUR);
      await voting.createElection("No voters", 2, now + 100, now + HOUR);
      await voting.addCandidate(2, "Kofi");
      await time.increaseTo(now + 100);

      await expect(voting.vote(1, DUMMY_PROOF)).to.be.revertedWithCustomError(voting, "NoCandidates");
      await expect(voting.vote(2, DUMMY_PROOF)).to.be.revertedWithCustomError(voting, "NoVoterList");
    });
  });

  describe("Results", function () {
    async function castAll(voting, relayer, prove, ballots) {
      for (const [identity, candidateId] of ballots) {
        await voting.connect(relayer).vote(1, await prove(identity, candidateId));
      }
    }

    it("anyone can finalize, and the clear winner is reported", async function () {
      const { voting, relayer, stranger, alice, bob, carol, prove, end } = await loadFixture(openFixture);
      await castAll(voting, relayer, prove, [[alice, 1], [bob, 1], [carol, 0]]);
      await time.increaseTo(end);

      await expect(voting.connect(stranger).finalize(1)).to.emit(voting, "ElectionFinalized").withArgs(1, [1], 2, 3);
      expect(await voting.getWinners(1)).to.deep.equal([1n]);
    });

    it("reports ties as multiple winners", async function () {
      const { voting, relayer, alice, bob, prove, end } = await loadFixture(openFixture);
      await castAll(voting, relayer, prove, [[alice, 0], [bob, 2]]);
      await time.increaseTo(end);
      await voting.finalize(1);
      expect(await voting.getWinners(1)).to.deep.equal([0n, 2n]);
    });

    it("a candidate who overtakes the early leader is the only winner", async function () {
      const { voting, relayer, alice, bob, carol, prove, end } = await loadFixture(openFixture);
      await castAll(voting, relayer, prove, [[alice, 0], [bob, 1], [carol, 1]]);
      await time.increaseTo(end);
      await voting.finalize(1);
      expect(await voting.getWinners(1)).to.deep.equal([1n]);
    });

    it("reports no winner when nobody voted", async function () {
      const { voting, end } = await loadFixture(electionFixture);
      await time.increaseTo(end);
      await voting.finalize(1);
      expect(await voting.getWinners(1)).to.deep.equal([]);
    });

    it("cannot finalize twice or read winners early", async function () {
      const { voting, end } = await loadFixture(openFixture);
      await expect(voting.getWinners(1)).to.be.revertedWithCustomError(voting, "WrongPhase");
      await time.increaseTo(end);
      await voting.finalize(1);
      await expect(voting.finalize(1)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Finalized);
    });
  });

  describe("Scope", function () {
    it("differs per election and per contract deployment", async function () {
      const { voting, semaphore, admin } = await loadFixture(deployFixture);
      const other = await ethers.deployContract("VotingV2", [admin.address, await semaphore.getAddress()]);
      expect(await voting.scopeOf(1)).to.not.equal(await voting.scopeOf(2));
      expect(await voting.scopeOf(1)).to.not.equal(await other.scopeOf(1));
    });
  });
});
