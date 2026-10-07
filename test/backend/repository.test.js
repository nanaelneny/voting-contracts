// Tests every database operation the backend uses.
//
// Always runs against the in-memory repository. To run the SAME tests against
// your SQL Server, set MSSQL_TEST=1 (npm run test:db). That uses a separate
// database named <DB_NAME>_test from voting-backend/.env, so your real data is untouched.
const path = require("path");
const { expect } = require("chai");
const { createMemoryRepository } = require("../../voting-backend/src/db/memoryRepository");
const { DuplicateError } = require("../../voting-backend/src/errors");

function repositorySuite(name, makeRepo, resetRepo) {
  describe(`Repository: ${name}`, function () {
    this.timeout(60_000);
    let repo;

    before(async () => {
      repo = await makeRepo();
    });
    beforeEach(async () => {
      if (resetRepo) await resetRepo(repo);
      else repo = await makeRepo();
    });
    after(async () => repo && repo.close());

    const user = (n, extra = {}) =>
      repo.createUser({ fullName: `User ${n}`, email: `user${n}@test.edu`, passwordHash: "hash", role: "voter", ...extra });
    const election = (createdBy, extra = {}) =>
      repo.createElection({
        title: "SRC 2026", description: "desc", createdBy,
        startTime: new Date("2030-01-01T08:00:00Z"), endTime: new Date("2030-01-01T17:00:00Z"), ...extra,
      });

    it("creates and finds users, rejecting duplicate emails and student ids", async () => {
      const u = await user(1, { studentId: "STU1" });
      expect(u).to.include({ fullName: "User 1", email: "user1@test.edu", studentId: "STU1", role: "voter" });
      expect((await repo.findUserByEmail("user1@test.edu")).id).to.equal(u.id);
      expect((await repo.findUserById(u.id)).email).to.equal("user1@test.edu");
      expect(await repo.findUserByEmail("nobody@test.edu")).to.equal(null);

      let err = await user(1).catch((e) => e);
      expect(err).to.be.instanceOf(DuplicateError);
      expect(err.field).to.equal("email");
      err = await user(2, { studentId: "STU1" }).catch((e) => e);
      expect(err.field).to.equal("studentId");
      await user(3); // two users without a student id are fine
      await user(4);
    });

    it("creates, updates, lists and deletes elections", async () => {
      const admin = await user(1, { role: "admin" });
      const e1 = await election(admin.id);
      const e2 = await election(admin.id, { title: "Later", startTime: new Date("2031-01-01T08:00:00Z"), endTime: new Date("2031-01-02T08:00:00Z") });
      expect(e1).to.include({ title: "SRC 2026", chainElectionId: null, publishedAt: null, cancelledAt: null });
      expect(e1.startTime.toISOString()).to.equal("2030-01-01T08:00:00.000Z");

      const updated = await repo.updateElection(e1.id, { title: "SRC 2026 (edited)" });
      expect(updated.title).to.equal("SRC 2026 (edited)");
      expect(updated.description).to.equal("desc");
      expect((await repo.updateElection(e1.id, { description: null })).description).to.equal(null);

      expect((await repo.listElections()).map((e) => e.id)).to.deep.equal([e2.id, e1.id]);

      await repo.setElectionChainId(e1.id, 7);
      await repo.markElectionPublished(e1.id);
      await repo.markElectionCancelled(e2.id);
      const [p, c] = [await repo.getElection(e1.id), await repo.getElection(e2.id)];
      expect(p.chainElectionId).to.equal(7);
      expect(p.publishedAt).to.be.instanceOf(Date);
      expect(c.cancelledAt).to.be.instanceOf(Date);

      await repo.deleteElection(e2.id);
      expect(await repo.getElection(e2.id)).to.equal(null);
    });

    it("manages candidates in insertion order", async () => {
      const admin = await user(1, { role: "admin" });
      const e = await election(admin.id);
      const a = await repo.addCandidate(e.id, { name: "Isaac", party: "Blue" });
      const b = await repo.addCandidate(e.id, { name: "Gloria" });
      expect(b.party).to.equal(null);
      expect((await repo.listCandidates(e.id)).map((c) => c.name)).to.deep.equal(["Isaac", "Gloria"]);

      await repo.setCandidateChainIndex(b.id, 1);
      expect((await repo.getCandidate(b.id)).chainIndex).to.equal(1);
      await repo.deleteCandidate(a.id);
      expect((await repo.listCandidates(e.id)).map((c) => c.name)).to.deep.equal(["Gloria"]);
    });

    it("saves registrations, replaces a commitment, and rejects duplicate commitments", async () => {
      const admin = await user(1, { role: "admin" });
      const [v1, v2] = [await user(2), await user(3)];
      const e = await election(admin.id);

      const r1 = await repo.saveRegistration(e.id, v1.id, "111");
      expect(r1).to.include({ electionId: e.id, userId: v1.id, commitment: "111", status: "pending", onChain: false });

      await repo.setRegistrationStatus(e.id, [r1.id], "approved", admin.id);
      const replaced = await repo.saveRegistration(e.id, v1.id, "112");
      expect(replaced).to.include({ id: r1.id, commitment: "112", status: "pending" });

      const err = await repo.saveRegistration(e.id, v2.id, "112").catch((x) => x);
      expect(err).to.be.instanceOf(DuplicateError);
      expect(err.field).to.equal("commitment");

      expect((await repo.getRegistration(e.id, v1.id)).commitment).to.equal("112");
      expect(await repo.getRegistration(e.id, v2.id)).to.equal(null);
      expect((await repo.getRegistrationById(r1.id)).userId).to.equal(v1.id);
    });

    it("reviews registrations and tracks which are on-chain, in group order", async () => {
      const admin = await user(1, { role: "admin" });
      const voters = [await user(2), await user(3), await user(4), await user(5)];
      const e = await election(admin.id);
      const regs = [];
      for (const [i, v] of voters.entries()) regs.push(await repo.saveRegistration(e.id, v.id, String(1000 + i)));

      expect(await repo.setRegistrationStatus(e.id, [regs[0].id, regs[1].id, regs[2].id], "approved", admin.id)).to.equal(3);
      expect(await repo.setRegistrationStatus(e.id, [regs[3].id], "rejected", admin.id)).to.equal(1);

      const listed = await repo.listRegistrations(e.id, { status: "approved" });
      expect(listed.map((r) => r.id)).to.deep.equal([regs[0].id, regs[1].id, regs[2].id]);
      expect(listed[0].user).to.deep.equal({ fullName: "User 2", email: "user2@test.edu", studentId: null });
      expect((await repo.listRegistrations(e.id)).length).to.equal(4);

      expect((await repo.listApprovedOffChain(e.id)).length).to.equal(3);
      await repo.markRegistrationsOnChain([{ id: regs[2].id, groupIndex: 0 }, { id: regs[0].id, groupIndex: 1 }]);
      expect((await repo.listApprovedOffChain(e.id)).map((r) => r.id)).to.deep.equal([regs[1].id]);
      expect(await repo.listGroupMembers(e.id)).to.deep.equal(["1002", "1000"]);

      // On-chain registrations can no longer be reviewed
      expect(await repo.setRegistrationStatus(e.id, [regs[2].id], "rejected", admin.id)).to.equal(0);
      expect(await repo.setRegistrationStatus(e.id, [], "rejected", admin.id)).to.equal(0);
    });

    it("deleting an election removes its candidates and registrations", async () => {
      const admin = await user(1, { role: "admin" });
      const v = await user(2);
      const e = await election(admin.id);
      await repo.addCandidate(e.id, { name: "Isaac" });
      await repo.saveRegistration(e.id, v.id, "5");
      await repo.deleteElection(e.id);
      expect(await repo.listCandidates(e.id)).to.deep.equal([]);
      expect(await repo.getRegistration(e.id, v.id)).to.equal(null);
    });

    it("logs relayed transactions and summarises them", async () => {
      await repo.logRelay({ kind: "vote", chainElectionId: 1, txHash: "0xabc", status: "success", gasUsed: "360000", latencyMs: 100 });
      await repo.logRelay({ kind: "vote", chainElectionId: 1, txHash: "0xdef", status: "success", gasUsed: "370000", latencyMs: 300 });
      await repo.logRelay({ kind: "vote", chainElectionId: 1, status: "rejected", errorCode: "AlreadyVoted", latencyMs: 20 });
      await repo.logRelay({ kind: "finalize", chainElectionId: 1, txHash: "0x123", status: "success", gasUsed: "90000", latencyMs: 50 });

      const stats = await repo.relayStats();
      expect(stats.vote).to.deep.equal({ count: 3, success: 2, rejected: 1, failed: 0, avgGasUsed: 365000, avgLatencyMs: 200 });
      expect(stats.finalize.count).to.equal(1);
    });
  });
}

repositorySuite("in-memory", async () => createMemoryRepository());

if (process.env.MSSQL_TEST === "1") {
  require("dotenv").config({ path: path.join(__dirname, "..", "..", "voting-backend", ".env") });
  const sql = require("../../voting-backend/node_modules/mssql");
  const fs = require("fs");
  const { createMssqlRepository } = require("../../voting-backend/src/db/mssqlRepository");
  const { loadConfig } = require("../../voting-backend/src/config");

  const base = loadConfig().db;
  const testDb = { ...base, database: `${base.database}_test` };

  repositorySuite(
    `SQL Server (${testDb.database})`,
    async () => {
      const master = await new sql.ConnectionPool({ ...testDb, database: "master" }).connect();
      await master.request().query(`IF DB_ID('${testDb.database}') IS NULL CREATE DATABASE [${testDb.database}]`);
      await master.close();
      const pool = await new sql.ConnectionPool(testDb).connect();
      await pool.request().batch(fs.readFileSync(path.join(__dirname, "..", "..", "voting-backend", "src", "db", "schema.sql"), "utf8"));
      await pool.close();
      return createMssqlRepository(testDb);
    },
    async () => {
      const pool = await new sql.ConnectionPool(testDb).connect();
      await pool.request().batch(`
        DELETE FROM dbo.RelayLog; DELETE FROM dbo.Registrations; DELETE FROM dbo.Candidates;
        DELETE FROM dbo.Elections; DELETE FROM dbo.Users;`);
      await pool.close();
    }
  );
}
