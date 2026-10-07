// SQL Server implementation of the repository. Every database query in the
// backend lives in this file. memoryRepository.js mirrors it for the tests.
const sql = require("mssql");
const { DuplicateError } = require("../errors");

// Unique constraint/index name -> field reported in DuplicateError
const UNIQUE_FIELDS = {
  UQ_Users_email: "email",
  UQ_Users_student_id: "studentId",
  UQ_Registrations_commitment: "commitment",
  UQ_Registrations_user: "registration",
};

function rethrowDuplicate(err) {
  if (err && (err.number === 2627 || err.number === 2601)) {
    const name = Object.keys(UNIQUE_FIELDS).find((k) => String(err.message).includes(k));
    throw new DuplicateError(UNIQUE_FIELDS[name] || "value");
  }
  throw err;
}

const mapUser = (r) =>
  r && { id: r.id, fullName: r.full_name, email: r.email, studentId: r.student_id, passwordHash: r.password_hash, role: r.role, createdAt: r.created_at };

const mapElection = (r) =>
  r && {
    id: r.id, title: r.title, description: r.description, startTime: r.start_time, endTime: r.end_time,
    chainElectionId: r.chain_election_id, publishedAt: r.published_at, cancelledAt: r.cancelled_at,
    createdBy: r.created_by, createdAt: r.created_at,
  };

const mapCandidate = (r) =>
  r && { id: r.id, electionId: r.election_id, name: r.name, party: r.party, chainIndex: r.chain_index, createdAt: r.created_at };

const mapRegistration = (r) =>
  r && {
    id: r.id, electionId: r.election_id, userId: r.user_id, commitment: r.commitment, status: r.status,
    onChain: Boolean(r.on_chain), groupIndex: r.group_index, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, createdAt: r.created_at,
  };

async function createMssqlRepository(dbConfig) {
  const pool = await new sql.ConnectionPool(dbConfig).connect();
  const req = () => pool.request();
  const one = (result, map) => map(result.recordset[0]) || null;

  return {
    // ── Users ──
    async createUser({ fullName, email, studentId = null, passwordHash, role }) {
      try {
        const r = await req()
          .input("full_name", sql.NVarChar(150), fullName)
          .input("email", sql.NVarChar(255), email)
          .input("student_id", sql.NVarChar(50), studentId)
          .input("password_hash", sql.NVarChar(255), passwordHash)
          .input("role", sql.NVarChar(10), role)
          .query(`INSERT INTO dbo.Users (full_name, email, student_id, password_hash, role)
                  OUTPUT INSERTED.* VALUES (@full_name, @email, @student_id, @password_hash, @role)`);
        return one(r, mapUser);
      } catch (err) {
        rethrowDuplicate(err);
      }
    },
    async findUserByEmail(email) {
      const r = await req().input("email", sql.NVarChar(255), email).query("SELECT * FROM dbo.Users WHERE email = @email");
      return one(r, mapUser);
    },
    async findUserById(id) {
      const r = await req().input("id", sql.Int, id).query("SELECT * FROM dbo.Users WHERE id = @id");
      return one(r, mapUser);
    },

    // ── Elections ──
    async createElection({ title, description = null, startTime, endTime, createdBy }) {
      const r = await req()
        .input("title", sql.NVarChar(200), title)
        .input("description", sql.NVarChar(sql.MAX), description)
        .input("start_time", sql.DateTime2, startTime)
        .input("end_time", sql.DateTime2, endTime)
        .input("created_by", sql.Int, createdBy)
        .query(`INSERT INTO dbo.Elections (title, description, start_time, end_time, created_by)
                OUTPUT INSERTED.* VALUES (@title, @description, @start_time, @end_time, @created_by)`);
      return one(r, mapElection);
    },
    async getElection(id) {
      const r = await req().input("id", sql.Int, id).query("SELECT * FROM dbo.Elections WHERE id = @id");
      return one(r, mapElection);
    },
    async listElections() {
      const r = await req().query("SELECT * FROM dbo.Elections ORDER BY start_time DESC, id DESC");
      return r.recordset.map(mapElection);
    },
    async updateElection(id, { title, description, startTime, endTime }) {
      const r = await req()
        .input("id", sql.Int, id)
        .input("title", sql.NVarChar(200), title ?? null)
        .input("description", sql.NVarChar(sql.MAX), description ?? null)
        .input("set_description", sql.Bit, description !== undefined)
        .input("start_time", sql.DateTime2, startTime ?? null)
        .input("end_time", sql.DateTime2, endTime ?? null)
        .query(`UPDATE dbo.Elections SET
                  title = COALESCE(@title, title),
                  description = CASE WHEN @set_description = 1 THEN @description ELSE description END,
                  start_time = COALESCE(@start_time, start_time),
                  end_time = COALESCE(@end_time, end_time)
                OUTPUT INSERTED.* WHERE id = @id`);
      return one(r, mapElection);
    },
    async deleteElection(id) {
      // Candidates and registrations are removed by ON DELETE CASCADE.
      await req().input("id", sql.Int, id).query("DELETE FROM dbo.Elections WHERE id = @id");
    },
    async setElectionChainId(id, chainElectionId) {
      await req().input("id", sql.Int, id).input("cid", sql.Int, chainElectionId)
        .query("UPDATE dbo.Elections SET chain_election_id = @cid WHERE id = @id");
    },
    async markElectionPublished(id) {
      await req().input("id", sql.Int, id).query("UPDATE dbo.Elections SET published_at = SYSUTCDATETIME() WHERE id = @id");
    },
    async markElectionCancelled(id) {
      await req().input("id", sql.Int, id).query("UPDATE dbo.Elections SET cancelled_at = SYSUTCDATETIME() WHERE id = @id");
    },

    // ── Candidates ──
    async addCandidate(electionId, { name, party = null }) {
      const r = await req()
        .input("election_id", sql.Int, electionId)
        .input("name", sql.NVarChar(150), name)
        .input("party", sql.NVarChar(100), party)
        .query(`INSERT INTO dbo.Candidates (election_id, name, party)
                OUTPUT INSERTED.* VALUES (@election_id, @name, @party)`);
      return one(r, mapCandidate);
    },
    async listCandidates(electionId) {
      const r = await req().input("eid", sql.Int, electionId).query("SELECT * FROM dbo.Candidates WHERE election_id = @eid ORDER BY id");
      return r.recordset.map(mapCandidate);
    },
    async getCandidate(id) {
      const r = await req().input("id", sql.Int, id).query("SELECT * FROM dbo.Candidates WHERE id = @id");
      return one(r, mapCandidate);
    },
    async deleteCandidate(id) {
      await req().input("id", sql.Int, id).query("DELETE FROM dbo.Candidates WHERE id = @id");
    },
    async setCandidateChainIndex(id, chainIndex) {
      await req().input("id", sql.Int, id).input("idx", sql.Int, chainIndex)
        .query("UPDATE dbo.Candidates SET chain_index = @idx WHERE id = @id");
    },

    // ── Registrations ──
    async saveRegistration(electionId, userId, commitment) {
      try {
        const r = await req()
          .input("eid", sql.Int, electionId)
          .input("uid", sql.Int, userId)
          .input("commitment", sql.VarChar(80), commitment)
          .query(`
            UPDATE dbo.Registrations
               SET commitment = @commitment, status = 'pending', reviewed_by = NULL, reviewed_at = NULL
            OUTPUT INSERTED.*
             WHERE election_id = @eid AND user_id = @uid;
            IF @@ROWCOUNT = 0
              INSERT INTO dbo.Registrations (election_id, user_id, commitment)
              OUTPUT INSERTED.* VALUES (@eid, @uid, @commitment);`);
        const rows = r.recordsets.flat();
        return mapRegistration(rows[0]);
      } catch (err) {
        rethrowDuplicate(err);
      }
    },
    async getRegistration(electionId, userId) {
      const r = await req().input("eid", sql.Int, electionId).input("uid", sql.Int, userId)
        .query("SELECT * FROM dbo.Registrations WHERE election_id = @eid AND user_id = @uid");
      return one(r, mapRegistration);
    },
    async getRegistrationById(id) {
      const r = await req().input("id", sql.Int, id).query("SELECT * FROM dbo.Registrations WHERE id = @id");
      return one(r, mapRegistration);
    },
    async listRegistrations(electionId, { status } = {}) {
      const r = await req()
        .input("eid", sql.Int, electionId)
        .input("status", sql.NVarChar(10), status || null)
        .query(`SELECT r.*, u.full_name, u.email, u.student_id
                  FROM dbo.Registrations r JOIN dbo.Users u ON u.id = r.user_id
                 WHERE r.election_id = @eid AND (@status IS NULL OR r.status = @status)
                 ORDER BY r.id`);
      return r.recordset.map((row) => ({
        ...mapRegistration(row),
        user: { fullName: row.full_name, email: row.email, studentId: row.student_id },
      }));
    },
    async setRegistrationStatus(electionId, ids, status, reviewerId) {
      if (ids.length === 0) return 0;
      const request = req().input("eid", sql.Int, electionId).input("status", sql.NVarChar(10), status).input("rid", sql.Int, reviewerId);
      const placeholders = ids.map((id, i) => {
        request.input(`id${i}`, sql.Int, id);
        return `@id${i}`;
      });
      const r = await request.query(`
        UPDATE dbo.Registrations SET status = @status, reviewed_by = @rid, reviewed_at = SYSUTCDATETIME()
         WHERE election_id = @eid AND on_chain = 0 AND id IN (${placeholders.join(", ")})`);
      return r.rowsAffected[0];
    },
    async listApprovedOffChain(electionId) {
      const r = await req().input("eid", sql.Int, electionId)
        .query("SELECT * FROM dbo.Registrations WHERE election_id = @eid AND status = 'approved' AND on_chain = 0 ORDER BY id");
      return r.recordset.map(mapRegistration);
    },
    async markRegistrationsOnChain(entries) {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const { id, groupIndex } of entries) {
          await new sql.Request(tx).input("id", sql.Int, id).input("gi", sql.Int, groupIndex)
            .query("UPDATE dbo.Registrations SET on_chain = 1, group_index = @gi WHERE id = @id");
        }
        await tx.commit();
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    },
    async listGroupMembers(electionId) {
      const r = await req().input("eid", sql.Int, electionId)
        .query("SELECT commitment FROM dbo.Registrations WHERE election_id = @eid AND on_chain = 1 ORDER BY group_index");
      return r.recordset.map((row) => row.commitment);
    },

    // ── Relay log ──
    async logRelay({ kind, chainElectionId = null, txHash = null, status, errorCode = null, gasUsed = null, latencyMs = null }) {
      await req()
        .input("kind", sql.NVarChar(20), kind)
        .input("cid", sql.Int, chainElectionId)
        .input("tx", sql.VarChar(66), txHash)
        .input("status", sql.NVarChar(10), status)
        .input("code", sql.NVarChar(100), errorCode)
        .input("gas", sql.BigInt, gasUsed === null ? null : Number(gasUsed))
        .input("lat", sql.Int, latencyMs)
        .query(`INSERT INTO dbo.RelayLog (kind, chain_election_id, tx_hash, status, error_code, gas_used, latency_ms)
                VALUES (@kind, @cid, @tx, @status, @code, @gas, @lat)`);
    },
    async relayStats() {
      const r = await req().query(`
        SELECT kind,
               COUNT(*) AS count,
               SUM(CASE WHEN status = 'success'  THEN 1 ELSE 0 END) AS success,
               SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
               SUM(CASE WHEN status = 'failed'   THEN 1 ELSE 0 END) AS failed,
               AVG(CASE WHEN status = 'success' THEN CAST(gas_used AS FLOAT) END)   AS avg_gas,
               AVG(CASE WHEN status = 'success' THEN CAST(latency_ms AS FLOAT) END) AS avg_latency
          FROM dbo.RelayLog GROUP BY kind`);
      const round = (x) => (x === null ? null : Math.round(x));
      return Object.fromEntries(
        r.recordset.map((row) => [
          row.kind,
          { count: row.count, success: row.success, rejected: row.rejected, failed: row.failed, avgGasUsed: round(row.avg_gas), avgLatencyMs: round(row.avg_latency) },
        ])
      );
    },

    async close() {
      await pool.close();
    },
  };
}

module.exports = { createMssqlRepository };
