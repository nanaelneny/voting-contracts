// In-memory implementation of the repository, used by the automated tests.
// It behaves like mssqlRepository.js (same methods, same return shapes, same
// duplicate errors) so the API code can't tell them apart.
const { DuplicateError } = require("../errors");

function createMemoryRepository() {
  const tables = { users: [], elections: [], candidates: [], registrations: [], relayLog: [] };
  const nextId = { users: 1, elections: 1, candidates: 1, registrations: 1, relayLog: 1 };
  const insert = (table, row) => {
    const full = { id: nextId[table]++, createdAt: new Date(), ...row };
    tables[table].push(full);
    return { ...full };
  };
  const copy = (row) => (row ? { ...row } : null);

  return {
    // ── Users ──
    async createUser({ fullName, email, studentId = null, passwordHash, role }) {
      if (tables.users.some((u) => u.email === email)) throw new DuplicateError("email");
      if (studentId && tables.users.some((u) => u.studentId === studentId)) throw new DuplicateError("studentId");
      return insert("users", { fullName, email, studentId, passwordHash, role });
    },
    async findUserByEmail(email) {
      return copy(tables.users.find((u) => u.email === email));
    },
    async findUserById(id) {
      return copy(tables.users.find((u) => u.id === id));
    },

    // ── Elections ──
    async createElection({ title, description = null, startTime, endTime, createdBy }) {
      return insert("elections", {
        title, description, startTime, endTime, createdBy,
        chainElectionId: null, publishedAt: null, cancelledAt: null,
      });
    },
    async getElection(id) {
      return copy(tables.elections.find((e) => e.id === id));
    },
    async listElections() {
      return [...tables.elections].sort((a, b) => b.startTime - a.startTime || b.id - a.id).map(copy);
    },
    async updateElection(id, fields) {
      const e = tables.elections.find((x) => x.id === id);
      for (const k of ["title", "description", "startTime", "endTime"]) if (fields[k] !== undefined) e[k] = fields[k];
      return copy(e);
    },
    async deleteElection(id) {
      tables.elections = tables.elections.filter((e) => e.id !== id);
      tables.candidates = tables.candidates.filter((c) => c.electionId !== id);
      tables.registrations = tables.registrations.filter((r) => r.electionId !== id);
    },
    async setElectionChainId(id, chainElectionId) {
      tables.elections.find((e) => e.id === id).chainElectionId = chainElectionId;
    },
    async markElectionPublished(id) {
      tables.elections.find((e) => e.id === id).publishedAt = new Date();
    },
    async markElectionCancelled(id) {
      tables.elections.find((e) => e.id === id).cancelledAt = new Date();
    },

    // ── Candidates ──
    async addCandidate(electionId, { name, party = null }) {
      return insert("candidates", { electionId, name, party, chainIndex: null });
    },
    async listCandidates(electionId) {
      return tables.candidates.filter((c) => c.electionId === electionId).sort((a, b) => a.id - b.id).map(copy);
    },
    async getCandidate(id) {
      return copy(tables.candidates.find((c) => c.id === id));
    },
    async deleteCandidate(id) {
      tables.candidates = tables.candidates.filter((c) => c.id !== id);
    },
    async setCandidateChainIndex(id, chainIndex) {
      tables.candidates.find((c) => c.id === id).chainIndex = chainIndex;
    },

    // ── Registrations ──
    /** Create the user's registration, or replace its commitment (back to pending) if not yet on-chain. */
    async saveRegistration(electionId, userId, commitment) {
      const clash = tables.registrations.find(
        (r) => r.electionId === electionId && r.commitment === commitment && r.userId !== userId
      );
      if (clash) throw new DuplicateError("commitment");
      const existing = tables.registrations.find((r) => r.electionId === electionId && r.userId === userId);
      if (existing) {
        Object.assign(existing, { commitment, status: "pending", reviewedBy: null, reviewedAt: null });
        return copy(existing);
      }
      return insert("registrations", {
        electionId, userId, commitment, status: "pending", onChain: false, groupIndex: null, reviewedBy: null, reviewedAt: null,
      });
    },
    async getRegistration(electionId, userId) {
      return copy(tables.registrations.find((r) => r.electionId === electionId && r.userId === userId));
    },
    async getRegistrationById(id) {
      return copy(tables.registrations.find((r) => r.id === id));
    },
    async listRegistrations(electionId, { status } = {}) {
      return tables.registrations
        .filter((r) => r.electionId === electionId && (!status || r.status === status))
        .sort((a, b) => a.id - b.id)
        .map((r) => {
          const u = tables.users.find((x) => x.id === r.userId);
          return { ...r, user: { fullName: u.fullName, email: u.email, studentId: u.studentId } };
        });
    },
    /** Approve/reject registrations that are not on-chain yet. Returns how many changed. */
    async setRegistrationStatus(electionId, ids, status, reviewerId) {
      let n = 0;
      for (const r of tables.registrations) {
        if (r.electionId === electionId && ids.includes(r.id) && !r.onChain) {
          Object.assign(r, { status, reviewedBy: reviewerId, reviewedAt: new Date() });
          n++;
        }
      }
      return n;
    },
    async listApprovedOffChain(electionId) {
      return tables.registrations
        .filter((r) => r.electionId === electionId && r.status === "approved" && !r.onChain)
        .sort((a, b) => a.id - b.id)
        .map(copy);
    },
    async markRegistrationsOnChain(entries) {
      for (const { id, groupIndex } of entries) {
        Object.assign(tables.registrations.find((r) => r.id === id), { onChain: true, groupIndex });
      }
    },
    /** Commitments in the exact order they were added to the Semaphore group. */
    async listGroupMembers(electionId) {
      return tables.registrations
        .filter((r) => r.electionId === electionId && r.onChain)
        .sort((a, b) => a.groupIndex - b.groupIndex)
        .map((r) => r.commitment);
    },

    // ── Relay log ──
    async logRelay(entry) {
      insert("relayLog", {
        kind: entry.kind, chainElectionId: entry.chainElectionId ?? null, txHash: entry.txHash ?? null,
        status: entry.status, errorCode: entry.errorCode ?? null, gasUsed: entry.gasUsed ?? null, latencyMs: entry.latencyMs ?? null,
      });
    },
    async relayStats() {
      const byKind = {};
      for (const r of tables.relayLog) {
        const s = (byKind[r.kind] ||= { count: 0, success: 0, rejected: 0, failed: 0, gas: [], latency: [] });
        s.count++;
        s[r.status]++;
        if (r.status === "success") {
          s.gas.push(Number(r.gasUsed));
          s.latency.push(r.latencyMs);
        }
      }
      const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
      return Object.fromEntries(
        Object.entries(byKind).map(([kind, s]) => [
          kind,
          { count: s.count, success: s.success, rejected: s.rejected, failed: s.failed, avgGasUsed: avg(s.gas), avgLatencyMs: avg(s.latency) },
        ])
      );
    },

    async close() {},
  };
}

module.exports = { createMemoryRepository };
