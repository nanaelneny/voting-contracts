// End-to-end tests: the real API + relayer against a local blockchain running the
// real VotingV2 and Semaphore contracts. The database is the in-memory repository
// (repository.test.js checks it behaves like SQL Server).
const { expect } = require("chai");
const request = require("supertest");
const bcrypt = require("../../voting-backend/node_modules/bcryptjs");
const { ethers, artifacts } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { Identity, Group } = require("@semaphore-protocol/core");
const { deploySemaphore, proveVote } = require("../helpers/semaphore");

const { createApp } = require("../../voting-backend/src/app");
const { createMemoryRepository } = require("../../voting-backend/src/db/memoryRepository");
const { createVotingClient } = require("../../voting-backend/src/chain/votingClient");

const HOUR = 3600;
const CONFIG = {
  jwtSecret: "test-secret",
  jwtExpiresIn: "1h",
  corsOrigin: "*",
  minPublishLeadSeconds: 120,
  voterBatchSize: 2, // small, so the tests exercise batching
  relayRateLimitPerMinute: 1000,
};

/** Fresh contracts, database and app. */
async function setup() {
  const [adminSigner, relayerSigner] = await ethers.getSigners();
  const semaphore = await deploySemaphore();
  const voting = await ethers.deployContract("VotingV2", [adminSigner.address, await semaphore.getAddress()]);
  const { abi } = await artifacts.readArtifact("VotingV2");

  const chain = createVotingClient({ address: await voting.getAddress(), abi, adminSigner, relayerSigner, voterBatchSize: CONFIG.voterBatchSize });
  const repo = createMemoryRepository();
  // Use blockchain time as "now", so moving the chain clock in tests moves the API's clock too.
  const clock = async () => new Date((await ethers.provider.getBlock("latest")).timestamp * 1000);
  const app = createApp({ repo, chain, config: CONFIG, clock });

  await repo.createUser({ fullName: "Election Officer", email: "admin@knust.edu.gh", passwordHash: await bcrypt.hash("admin-password", 4), role: "admin" });
  const adminToken = (await request(app).post("/api/auth/login").send({ email: "admin@knust.edu.gh", password: "admin-password" })).body.token;

  return { app, repo, chain, voting, semaphore, relayerSigner, adminToken, clock };
}

async function registerVoter(app, n) {
  const res = await request(app).post("/api/auth/register").send({
    fullName: `Student ${n}`, email: `student${n}@st.knust.edu.gh`, studentId: `2026${n}`, password: "password123",
  });
  expect(res.status).to.equal(201);
  return res.body.token;
}

const as = (token) => ({ Authorization: `Bearer ${token}` });

async function createElection(ctx, { startIn = HOUR, length = 2 * HOUR, candidates = ["Isaac", "Gloria", "Rachael"] } = {}) {
  const now = (await ctx.clock()).getTime();
  const res = await request(ctx.app).post("/api/elections").set(as(ctx.adminToken)).send({
    title: "SRC Elections 2026", description: "Student Representative Council",
    startTime: new Date(now + startIn * 1000).toISOString(), endTime: new Date(now + (startIn + length) * 1000).toISOString(),
  });
  expect(res.status).to.equal(201);
  const id = res.body.election.id;
  const ids = [];
  for (const name of candidates) {
    ids.push((await request(ctx.app).post(`/api/elections/${id}/candidates`).set(as(ctx.adminToken)).send({ name, party: `${name} Party` })).body.candidate.id);
  }
  return { id, candidateIds: ids, start: Math.floor(now / 1000) + startIn, end: Math.floor(now / 1000) + startIn + length };
}

/** What a voter's browser does: fetch the group, check it against the chain root, and build a proof. */
async function buildBallot(app, electionId, identity, candidateIndex) {
  const { body } = await request(app).get(`/api/elections/${electionId}/group`);
  const group = new Group(body.members.map(BigInt));
  expect(group.root.toString()).to.equal(body.root); // the member list matches what's on-chain
  return proveVote(identity, group, candidateIndex, body.scope);
}

describe("Backend API", function () {
  this.timeout(300_000);

  describe("Accounts", function () {
    let ctx;
    before(async () => (ctx = await setup()));

    it("public sign-up always creates a voter, and /me returns the account", async () => {
      const res = await request(ctx.app).post("/api/auth/register").send({
        fullName: "Ama Mensah", email: "AMA@st.knust.edu.gh", password: "password123", role: "admin",
      });
      expect(res.status).to.equal(201);
      expect(res.body.user).to.include({ email: "ama@st.knust.edu.gh", role: "voter" });
      expect(res.body.user).to.not.have.property("passwordHash");

      const me = await request(ctx.app).get("/api/auth/me").set(as(res.body.token));
      expect(me.body.user.fullName).to.equal("Ama Mensah");
    });

    it("rejects duplicate emails, short passwords and bad emails", async () => {
      const base = { fullName: "Kofi", email: "kofi@st.knust.edu.gh", password: "password123" };
      expect((await request(ctx.app).post("/api/auth/register").send(base)).status).to.equal(201);
      const dup = await request(ctx.app).post("/api/auth/register").send(base);
      expect(dup.status).to.equal(409);
      expect((await request(ctx.app).post("/api/auth/register").send({ ...base, email: "x@y.z", password: "short" })).status).to.equal(400);
      expect((await request(ctx.app).post("/api/auth/register").send({ ...base, email: "not-an-email" })).status).to.equal(400);
    });

    it("login checks the password and doesn't reveal whether an email exists", async () => {
      await registerVoter(ctx.app, 1);
      const ok = await request(ctx.app).post("/api/auth/login").send({ email: "student1@st.knust.edu.gh", password: "password123" });
      expect(ok.status).to.equal(200);
      expect(ok.body.token).to.be.a("string");

      const wrong = await request(ctx.app).post("/api/auth/login").send({ email: "student1@st.knust.edu.gh", password: "nope-nope" });
      const missing = await request(ctx.app).post("/api/auth/login").send({ email: "ghost@st.knust.edu.gh", password: "nope-nope" });
      expect(wrong.status).to.equal(401);
      expect(missing.body.error).to.equal(wrong.body.error);
    });

    it("protects admin routes", async () => {
      const voter = await registerVoter(ctx.app, 2);
      const body = { title: "X", startTime: "2030-01-01T00:00:00Z", endTime: "2030-01-02T00:00:00Z" };
      expect((await request(ctx.app).post("/api/elections").send(body)).status).to.equal(401);
      expect((await request(ctx.app).post("/api/elections").set(as(voter)).send(body)).status).to.equal(403);
      expect((await request(ctx.app).post("/api/elections").set(as("garbage")).send(body)).status).to.equal(401);
      expect((await request(ctx.app).get("/api/admin/relay-stats").set(as(voter))).status).to.equal(403);
    });
  });

  describe("Election drafts", function () {
    let ctx;
    before(async () => (ctx = await setup()));

    it("admin creates, edits and lists a draft with candidates", async () => {
      const { id, candidateIds } = await createElection(ctx);
      const edit = await request(ctx.app).put(`/api/elections/${id}`).set(as(ctx.adminToken)).send({ title: "SRC Elections 2026/27" });
      expect(edit.body.election).to.include({ title: "SRC Elections 2026/27", status: "draft" });

      await request(ctx.app).delete(`/api/elections/${id}/candidates/${candidateIds[2]}`).set(as(ctx.adminToken)).expect(204);
      const detail = await request(ctx.app).get(`/api/elections/${id}`);
      expect(detail.body.candidates.map((c) => c.name)).to.deep.equal(["Isaac", "Gloria"]);

      const list = await request(ctx.app).get("/api/elections");
      expect(list.body.elections[0]).to.include({ id, status: "draft", chainElectionId: null });
    });

    it("validates election times", async () => {
      const res = await request(ctx.app).post("/api/elections").set(as(ctx.adminToken))
        .send({ title: "Bad", startTime: "2030-01-02T00:00:00Z", endTime: "2030-01-01T00:00:00Z" });
      expect(res.status).to.equal(400);
      expect((await request(ctx.app).post("/api/elections").set(as(ctx.adminToken)).send({ title: "Bad", startTime: "soon", endTime: "later" })).status).to.equal(400);
    });

    it("won't publish without candidates or with a start time too close", async () => {
      const empty = await createElection(ctx, { candidates: [] });
      const r1 = await request(ctx.app).post(`/api/elections/${empty.id}/publish`).set(as(ctx.adminToken));
      expect(r1.status).to.equal(400);
      expect(r1.body.code).to.equal("NO_CANDIDATES");

      const soon = await createElection(ctx, { startIn: 30 });
      const r2 = await request(ctx.app).post(`/api/elections/${soon.id}/publish`).set(as(ctx.adminToken));
      expect(r2.body.code).to.equal("START_TOO_SOON");
    });

    it("deletes a draft", async () => {
      const { id } = await createElection(ctx);
      await request(ctx.app).delete(`/api/elections/${id}`).set(as(ctx.adminToken)).expect(204);
      expect((await request(ctx.app).get(`/api/elections/${id}`)).status).to.equal(404);
    });
  });

  describe("A complete anonymous election", function () {
    let ctx, election;
    const voters = []; // { token, identity }
    let regIds;

    before(async () => {
      ctx = await setup();
      election = await createElection(ctx);
      for (let n = 1; n <= 5; n++) voters.push({ token: await registerVoter(ctx.app, n), identity: new Identity() });
    });

    it("voters register for the election with commitments generated in their browsers", async () => {
      for (const v of voters.slice(0, 4)) {
        const res = await request(ctx.app).post(`/api/elections/${election.id}/registration`).set(as(v.token))
          .send({ commitment: v.identity.commitment.toString() });
        expect(res.status).to.equal(201);
        expect(res.body.registration).to.include({ status: "pending", onChain: false });
      }
      // Someone else's commitment can't be reused
      const dup = await request(ctx.app).post(`/api/elections/${election.id}/registration`).set(as(voters[4].token))
        .send({ commitment: voters[0].identity.commitment.toString() });
      expect(dup.status).to.equal(409);
      // Must be logged in, and the commitment must be a valid number
      expect((await request(ctx.app).post(`/api/elections/${election.id}/registration`).send({ commitment: "1" })).status).to.equal(401);
      expect((await request(ctx.app).post(`/api/elections/${election.id}/registration`).set(as(voters[4].token)).send({ commitment: "0x12" })).status).to.equal(400);
    });

    it("admin reviews registrations: approves three, rejects one", async () => {
      const list = await request(ctx.app).get(`/api/elections/${election.id}/registrations?status=pending`).set(as(ctx.adminToken));
      expect(list.body.registrations).to.have.length(4);
      expect(list.body.registrations[0].user).to.include({ fullName: "Student 1" });
      regIds = list.body.registrations.map((r) => r.id);

      const ok = await request(ctx.app).post(`/api/elections/${election.id}/registrations/review`).set(as(ctx.adminToken))
        .send({ ids: regIds.slice(0, 3), status: "approved" });
      expect(ok.body.updated).to.equal(3);
      await request(ctx.app).post(`/api/elections/${election.id}/registrations/review`).set(as(ctx.adminToken))
        .send({ ids: [regIds[3]], status: "rejected" }).expect(200);

      const mine = await request(ctx.app).get(`/api/elections/${election.id}/registration`).set(as(voters[3].token));
      expect(mine.body.registration.status).to.equal("rejected");
    });

    it("publishing creates the election on-chain with its candidates and approved voters", async () => {
      const res = await request(ctx.app).post(`/api/elections/${election.id}/publish`).set(as(ctx.adminToken));
      expect(res.status).to.equal(200);
      expect(res.body).to.include({ candidates: 3, votersAdded: 3 });

      const onChain = await ctx.voting.getElection(res.body.chainElectionId);
      expect(onChain.voterCount).to.equal(3);
      expect(onChain.candidateCount).to.equal(3);
      expect(onChain.offchainId).to.equal(election.id);

      const detail = await request(ctx.app).get(`/api/elections/${election.id}`);
      expect(detail.body.election.status).to.equal("upcoming");
      expect(detail.body.candidates.map((c) => c.chainIndex)).to.deep.equal([0, 1, 2]);

      const reg = await request(ctx.app).get(`/api/elections/${election.id}/registration`).set(as(voters[0].token));
      expect(reg.body.registration.onChain).to.equal(true);
    });

    it("a published election can't be edited, and publishing twice is refused", async () => {
      const edit = await request(ctx.app).put(`/api/elections/${election.id}`).set(as(ctx.adminToken)).send({ title: "Changed" });
      expect(edit.status).to.equal(409);
      expect((await request(ctx.app).post(`/api/elections/${election.id}/candidates`).set(as(ctx.adminToken)).send({ name: "Late" })).status).to.equal(409);
      expect((await request(ctx.app).post(`/api/elections/${election.id}/publish`).set(as(ctx.adminToken))).body.code).to.equal("ALREADY_PUBLISHED");
    });

    it("late registrations can still be added before voting opens", async () => {
      const v = voters[4];
      await request(ctx.app).post(`/api/elections/${election.id}/registration`).set(as(v.token)).send({ commitment: v.identity.commitment.toString() }).expect(201);
      const { body } = await request(ctx.app).get(`/api/elections/${election.id}/registrations?status=pending`).set(as(ctx.adminToken));
      await request(ctx.app).post(`/api/elections/${election.id}/registrations/review`).set(as(ctx.adminToken)).send({ ids: [body.registrations[0].id], status: "approved" });

      const sync = await request(ctx.app).post(`/api/elections/${election.id}/sync-voters`).set(as(ctx.adminToken));
      expect(sync.body).to.deep.equal({ added: 1, voterCount: 4 });
      const again = await request(ctx.app).post(`/api/elections/${election.id}/sync-voters`).set(as(ctx.adminToken));
      expect(again.body).to.deep.equal({ added: 0, voterCount: 4 });
    });

    it("an on-chain registration can't be swapped for another identity", async () => {
      const res = await request(ctx.app).post(`/api/elections/${election.id}/registration`).set(as(voters[0].token))
        .send({ commitment: new Identity().commitment.toString() });
      expect(res.body.code).to.equal("ALREADY_ON_CHAIN");
    });

    it("the group endpoint lists members in on-chain order, matching the on-chain root", async () => {
      const { body } = await request(ctx.app).get(`/api/elections/${election.id}/group`);
      const expected = [0, 1, 2, 4].map((i) => voters[i].identity.commitment.toString());
      expect(body.members).to.deep.equal(expected);
      expect(new Group(body.members.map(BigInt)).root.toString()).to.equal(body.root);
      expect(body.phase).to.equal("setup");
    });

    it("votes are refused before voting opens", async () => {
      const proof = await buildBallot(ctx.app, election.id, voters[0].identity, 0);
      const res = await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof });
      expect(res.status).to.equal(409);
      expect(res.body.code).to.equal("VOTING_NOT_OPEN");
    });

    it("once voting opens, registration and voter changes are closed", async () => {
      await time.increaseTo(election.start);
      const reg = await request(ctx.app).post(`/api/elections/${election.id}/registration`).set(as(voters[3].token))
        .send({ commitment: voters[3].identity.commitment.toString() });
      expect(reg.body.code).to.equal("REGISTRATION_CLOSED");
      expect((await request(ctx.app).post(`/api/elections/${election.id}/sync-voters`).set(as(ctx.adminToken))).body.code).to.equal("VOTING_STARTED");
      expect((await request(ctx.app).post(`/api/elections/${election.id}/cancel`).set(as(ctx.adminToken))).body.code).to.equal("VOTING_STARTED");
    });

    it("registered voters vote anonymously through the relayer, with no login", async () => {
      const choices = [1, 1, 0, 2]; // voters 0, 1, 2, 4
      for (const [k, i] of [0, 1, 2, 4].entries()) {
        const proof = await buildBallot(ctx.app, election.id, voters[i].identity, choices[k]);
        const res = await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof }); // no Authorization header
        expect(res.status).to.equal(201);
        expect(res.body.txHash).to.match(/^0x[0-9a-f]{64}$/);

        const tx = await ethers.provider.getTransaction(res.body.txHash);
        expect(tx.from).to.equal(ctx.relayerSigner.address); // the relayer paid, not the voter
      }

      const results = await request(ctx.app).get(`/api/elections/${election.id}/results`);
      expect(results.body).to.include({ phase: "voting", totalVotes: 4, voterCount: 4, turnout: 100 });
      expect(results.body.candidates.map((c) => [c.name, c.party, c.votes])).to.deep.equal([
        ["Isaac", "Isaac Party", 1], ["Gloria", "Gloria Party", 2], ["Rachael", "Rachael Party", 1],
      ]);
    });

    it("rejects a second vote from the same voter", async () => {
      const proof = await buildBallot(ctx.app, election.id, voters[0].identity, 2);
      const res = await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof });
      expect(res.status).to.equal(409);
      expect(res.body.code).to.equal("ALREADY_VOTED");
    });

    it("rejects the voter whose registration was rejected", async () => {
      const { body } = await request(ctx.app).get(`/api/elections/${election.id}/group`);
      const fakeGroup = new Group([...body.members.map(BigInt), voters[3].identity.commitment]);
      const proof = await proveVote(voters[3].identity, fakeGroup, 0, body.scope);
      const res = await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof });
      expect(res.status).to.equal(403);
      expect(res.body.code).to.equal("NOT_REGISTERED");
    });

    it("rejects tampered and malformed proofs", async () => {
      // Voter 1 already voted, but tampering is caught before that's even checked.
      const proof = await buildBallot(ctx.app, election.id, voters[1].identity, 0);
      const tampered = await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof: { ...proof, message: "2", nullifier: "12345" } });
      expect(tampered.body.code).to.equal("INVALID_PROOF");

      expect((await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({})).body.code).to.equal("BAD_PROOF");
      expect((await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof: { ...proof, points: [1, 2] } })).body.code).to.equal("BAD_PROOF");
      expect((await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof: { ...proof, scope: "-1" } })).body.code).to.equal("BAD_PROOF");
    });

    it("rejected votes cost the relayer no gas", async () => {
      const before = await ethers.provider.getBalance(ctx.relayerSigner.address);
      const proof = await buildBallot(ctx.app, election.id, voters[0].identity, 1);
      await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof }).expect(409);
      await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof: { ...proof, message: "0", nullifier: "777" } }).expect(400);
      expect(await ethers.provider.getBalance(ctx.relayerSigner.address)).to.equal(before);
    });

    it("finalizing is refused until voting closes, then records the winner", async () => {
      const early = await request(ctx.app).post(`/api/elections/${election.id}/finalize`).set(as(ctx.adminToken));
      expect(early.body.code).to.equal("CANNOT_FINALIZE");

      await time.increaseTo(election.end);
      const late = await request(ctx.app).post(`/api/elections/${election.id}/votes`).send({ proof: await buildBallot(ctx.app, election.id, voters[2].identity, 0) });
      expect(late.body.code).to.equal("VOTING_NOT_OPEN");

      const res = await request(ctx.app).post(`/api/elections/${election.id}/finalize`).set(as(ctx.adminToken));
      expect(res.status).to.equal(200);
      expect(res.body.results).to.include({ phase: "finalized", tie: false });
      expect(res.body.results.winners).to.deep.equal([election.candidateIds[1]]); // Gloria, by database id

      const again = await request(ctx.app).post(`/api/elections/${election.id}/finalize`).set(as(ctx.adminToken));
      expect(again.body.code).to.equal("CANNOT_FINALIZE");
      expect((await request(ctx.app).get("/api/elections")).body.elections[0].status).to.equal("closed");
    });

    it("relay statistics are recorded for evaluation, with nothing about voters", async () => {
      const { body } = await request(ctx.app).get("/api/admin/relay-stats").set(as(ctx.adminToken));
      expect(body.stats.vote.success).to.equal(4);
      expect(body.stats.vote.rejected).to.be.greaterThan(0);
      expect(body.stats.vote.avgGasUsed).to.be.within(300_000, 450_000);
      expect(body.stats.finalize.success).to.equal(1);
    });
  });

  describe("Cancelling and recovery", function () {
    let ctx;
    before(async () => (ctx = await setup()));

    it("cancels a draft and a published election before voting opens", async () => {
      const draft = await createElection(ctx);
      await request(ctx.app).post(`/api/elections/${draft.id}/cancel`).set(as(ctx.adminToken)).expect(200);
      expect((await request(ctx.app).get(`/api/elections/${draft.id}`)).body.election.status).to.equal("cancelled");

      const pub = await createElection(ctx);
      const { body } = await request(ctx.app).post(`/api/elections/${pub.id}/publish`).set(as(ctx.adminToken));
      await request(ctx.app).post(`/api/elections/${pub.id}/cancel`).set(as(ctx.adminToken)).expect(200);
      expect(await ctx.voting.phase(body.chainElectionId)).to.equal(4); // Cancelled on-chain

      await time.increaseTo(pub.start);
      const vote = await request(ctx.app).post(`/api/elections/${pub.id}/votes`).send({ proof: { merkleTreeDepth: 1, merkleTreeRoot: 1, nullifier: 1, message: 0, scope: 1, points: Array(8).fill(1) } });
      expect(vote.status).to.equal(404);
    });

    it("publishing resumes cleanly if a previous attempt stopped halfway", async () => {
      const e = await createElection(ctx);
      // Simulate a crash right after the on-chain election was created
      const db = await ctx.repo.getElection(e.id);
      const chainId = await ctx.chain.createElection({ title: db.title, offchainId: db.id, startTime: db.startTime, endTime: db.endTime });
      await ctx.repo.setElectionChainId(e.id, chainId);
      expect((await request(ctx.app).get(`/api/elections/${e.id}`)).body.election.status).to.equal("publishing");

      const res = await request(ctx.app).post(`/api/elections/${e.id}/publish`).set(as(ctx.adminToken));
      expect(res.status).to.equal(200);
      expect(res.body.chainElectionId).to.equal(chainId); // same election, not a duplicate
      expect(await ctx.voting.electionCount()).to.equal(chainId);
      expect((await ctx.voting.getElection(chainId)).candidateCount).to.equal(3);
    });
  });
});
