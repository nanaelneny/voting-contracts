// Deletes all elections, candidates, registrations and relay statistics, keeping user accounts.
// Use it after restarting the local blockchain, because elections published to the old
// chain no longer exist on the new one.
//   npm run db:reset
const sql = require("mssql");
const { loadConfig } = require("../src/config");

async function main() {
  const { db } = loadConfig();
  const pool = await new sql.ConnectionPool(db).connect();
  const r = await pool.request().batch(`
    DELETE FROM dbo.RelayLog;
    DELETE FROM dbo.Registrations;
    DELETE FROM dbo.Candidates;
    DELETE FROM dbo.Elections;
    SELECT COUNT(*) AS users FROM dbo.Users;`);
  await pool.close();
  console.log(`Elections cleared from "${db.database}". ${r.recordset[0].users} user account(s) kept.`);
}

main().catch((err) => {
  console.error("Reset failed:", err.message);
  process.exitCode = 1;
});
