const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { buildVoterTree } = require("../scripts/voterTree");

const Phase = { Setup: 0, Voting: 1, Ended: 2, Finalized: 3, Cancelled: 4 };
const HOUR = 3600;

describe("VotingV2", function () {
  async function deployFixture() {
    const [admin, alice, bob, carol, outsider] = await ethers.getSigners();
    const voting = await ethers.deployContract("VotingV2", [admin.address]);
    return { voting, admin, alice, bob, carol, outsider };
  }

  // An election with 3 candidates and alice, bob, carol approved; still in Setup.
  async function electionFixture() {
    const base = await deployFixture();
    const { voting, alice, bob, carol } = base;
    const now = await time.latest();
    const start = now + HOUR;
    const end = start + 2 * HOUR;

    await voting.createElection("SRC Elections 2026", 3, start, end);
    await voting.addCandidates(1, ["Isaac", "Gloria", "Rachael"]);

    const tree = buildVoterTree([alice.address, bob.address, carol.address]);
    await voting.setVoterRoot(1, tree.root, tree.count);

    return { ...base, tree, start, end, id: 1 };
  }

  async function openFixture() {
    const f = await electionFixture();
    await time.increaseTo(f.start);
    return f;
  }

  describe("Election setup", function () {
    it("creates elections with sequential ids starting at 1", async function () {
      const { voting } = await loadFixture(deployFixture);
      const now = await time.latest();
      await expect(voting.createElection("A", 10, now + HOUR, now + 2 * HOUR))
        .to.emit(voting, "ElectionCreated")
        .withArgs(1, 10, "A", now + HOUR, now + 2 * HOUR);
      await voting.createElection("B", 11, now + HOUR, now + 2 * HOUR);
      expect(await voting.electionCount()).to.equal(2);
      expect((await voting.getElection(2)).offchainId).to.equal(11);
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
      const names = Array.from({ length: 47 }, (_, i) => `C${i}`);
      await voting.addCandidates(1, names); // 3 + 47 = 50
      await expect(voting.addCandidate(1, "One too many")).to.be.revertedWithCustomError(voting, "TooManyCandidates");
    });

    it("rejects an empty voter list", async function () {
      const { voting } = await loadFixture(electionFixture);
      await expect(voting.setVoterRoot(1, ethers.ZeroHash, 3)).to.be.revertedWithCustomError(voting, "NoVoterList");
      await expect(voting.setVoterRoot(1, ethers.id("x"), 0)).to.be.revertedWithCustomError(voting, "NoVoterList");
    });

    it("reverts for elections that do not exist", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.getElection(0)).to.be.revertedWithCustomError(voting, "ElectionNotFound");
      await expect(voting.getCandidates(1)).to.be.revertedWithCustomError(voting, "ElectionNotFound");
    });
  });

  describe("Access control", function () {
    it("only the admin can create and configure elections", async function () {
      const { voting, alice, tree } = await loadFixture(electionFixture);
      const now = await time.latest();
      const v = voting.connect(alice);
      await expect(v.createElection("X", 1, now + HOUR, now + 2 * HOUR)).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
      await expect(v.addCandidate(1, "Me")).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
      await expect(v.setVoterRoot(1, tree.root, 1)).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
      await expect(v.cancelElection(1)).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
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
      const { voting, tree } = await loadFixture(openFixture);
      await expect(voting.addCandidate(1, "Late")).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Voting);
      await expect(voting.setVoterRoot(1, tree.root, 3)).to.be.revertedWithCustomError(voting, "WrongPhase");
      await expect(voting.cancelElection(1)).to.be.revertedWithCustomError(voting, "WrongPhase");
    });

    it("cannot finalize before voting closes", async function () {
      const { voting } = await loadFixture(openFixture);
      await expect(voting.finalize(1)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Voting);
    });

    it("a cancelled election cannot be voted in or finalized", async function () {
      const { voting, alice, tree, start, end } = await loadFixture(electionFixture);
      await expect(voting.cancelElection(1)).to.emit(voting, "ElectionCancelled").withArgs(1);
      await time.increaseTo(start);
      expect(await voting.phase(1)).to.equal(Phase.Cancelled);
      await expect(voting.connect(alice).vote(1, 0, tree.getProof(alice.address))).to.be.revertedWithCustomError(voting, "WrongPhase");
      await time.increaseTo(end);
      await expect(voting.finalize(1)).to.be.revertedWithCustomError(voting, "WrongPhase");
    });
  });

  describe("Voting", function () {
    it("lets an approved voter vote once and records it", async function () {
      const { voting, alice, tree } = await loadFixture(openFixture);
      await expect(voting.connect(alice).vote(1, 1, tree.getProof(alice.address)))
        .to.emit(voting, "VoteCast")
        .withArgs(1, alice.address, 1);

      expect(await voting.hasVoted(1, alice.address)).to.equal(true);
      expect((await voting.getCandidates(1))[1].voteCount).to.equal(1);
      expect((await voting.getElection(1)).totalVotes).to.equal(1);
    });

    it("blocks double voting", async function () {
      const { voting, alice, tree } = await loadFixture(openFixture);
      const proof = tree.getProof(alice.address);
      await voting.connect(alice).vote(1, 0, proof);
      await expect(voting.connect(alice).vote(1, 2, proof)).to.be.revertedWithCustomError(voting, "AlreadyVoted");
    });

    it("blocks wallets that are not on the approved list", async function () {
      const { voting, outsider, alice, tree } = await loadFixture(openFixture);
      expect(tree.getProof(outsider.address)).to.equal(null);
      await expect(voting.connect(outsider).vote(1, 0, [])).to.be.revertedWithCustomError(voting, "NotEligible");
    });

    it("blocks an outsider who reuses someone else's proof", async function () {
      const { voting, outsider, alice, tree } = await loadFixture(openFixture);
      await expect(voting.connect(outsider).vote(1, 0, tree.getProof(alice.address))).to.be.revertedWithCustomError(voting, "NotEligible");
    });

    it("rejects invalid candidate ids", async function () {
      const { voting, alice, tree } = await loadFixture(openFixture);
      await expect(voting.connect(alice).vote(1, 3, tree.getProof(alice.address)))
        .to.be.revertedWithCustomError(voting, "InvalidCandidate")
        .withArgs(3);
    });

    it("rejects votes before opening and after closing", async function () {
      const { voting, alice, tree, end } = await loadFixture(electionFixture);
      const proof = tree.getProof(alice.address);
      await expect(voting.connect(alice).vote(1, 0, proof)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Setup);
      await time.increaseTo(end);
      await expect(voting.connect(alice).vote(1, 0, proof)).to.be.revertedWithCustomError(voting, "WrongPhase").withArgs(1, Phase.Ended);
    });

    it("voting in one election does not affect another", async function () {
      const { voting, alice, tree, start } = await loadFixture(electionFixture);
      await voting.createElection("Second", 9, start - 10, start + HOUR);
      await voting.addCandidate(2, "Kofi");
      await voting.setVoterRoot(2, tree.root, tree.count);
      await time.increaseTo(start);

      await voting.connect(alice).vote(1, 0, tree.getProof(alice.address));
      expect(await voting.hasVoted(2, alice.address)).to.equal(false);
      await voting.connect(alice).vote(2, 0, tree.getProof(alice.address));
      expect((await voting.getCandidates(2))[0].voteCount).to.equal(1);
    });

    it("refuses votes in an election opened without candidates or a voter list", async function () {
      const { voting, alice, tree } = await loadFixture(deployFixture);
      const now = await time.latest();
      await voting.createElection("Empty", 1, now + 10, now + HOUR);
      await time.increaseTo(now + 10);
      await expect(voting.connect(alice).vote(1, 0, [])).to.be.revertedWithCustomError(voting, "NoCandidates");

      await voting.createElection("No list", 2, now + 100, now + HOUR);
      await voting.addCandidate(2, "Kofi");
      await time.increaseTo(now + 100);
      await expect(voting.connect(alice).vote(2, 0, [])).to.be.revertedWithCustomError(voting, "NoVoterList");
    });
  });

  describe("Results", function () {
    async function voteAll(voting, tree, ballots) {
      for (const [signer, candidateId] of ballots) {
        await voting.connect(signer).vote(1, candidateId, tree.getProof(signer.address));
      }
    }

    it("anyone can finalize, and the clear winner is reported", async function () {
      const { voting, alice, bob, carol, outsider, tree, end } = await loadFixture(openFixture);
      await voteAll(voting, tree, [[alice, 1], [bob, 1], [carol, 0]]);
      await time.increaseTo(end);

      await expect(voting.connect(outsider).finalize(1))
        .to.emit(voting, "ElectionFinalized")
        .withArgs(1, [1], 2, 3);
      expect(await voting.getWinners(1)).to.deep.equal([1n]);
    });

    it("reports ties as multiple winners", async function () {
      const { voting, alice, bob, tree, end } = await loadFixture(openFixture);
      await voteAll(voting, tree, [[alice, 0], [bob, 2]]);
      await time.increaseTo(end);
      await voting.finalize(1);
      expect(await voting.getWinners(1)).to.deep.equal([0n, 2n]);
    });

    it("a candidate who overtakes the early leader is the only winner", async function () {
      const { voting, alice, bob, carol, tree, end } = await loadFixture(openFixture);
      // Candidate 0 leads first, then candidate 1 overtakes it
      await voteAll(voting, tree, [[alice, 0], [bob, 1], [carol, 1]]);
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

  describe("Eligibility helper", function () {
    it("isEligible matches the off-chain tree", async function () {
      const { voting, alice, outsider, tree } = await loadFixture(electionFixture);
      expect(await voting.isEligible(1, alice.address, tree.getProof(alice.address))).to.equal(true);
      expect(await voting.isEligible(1, outsider.address, tree.getProof(alice.address))).to.equal(false);
    });

    it("isEligible is false before a voter list is published", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      const now = await time.latest();
      await voting.createElection("A", 1, now + HOUR, now + 2 * HOUR);
      expect(await voting.isEligible(1, alice.address, [])).to.equal(false);
    });
  });
});
