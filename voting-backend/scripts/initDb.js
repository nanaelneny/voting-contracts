// Creates the database (if missing) and its tables. Safe to run more than once.
//   npm run db:init
const fs = require("fs");
const path = require("path");
const sql = require("mssql");
const { loadConfig } = require("../src/config");

async function main() {
  const { db } = loadConfig();
  if (!/^[A-Za-z0-9_]+$/.test(db.database)) throw new Error("DB_NAME may only contain letters, digits and underscores");

  const master = await new sql.ConnectionPool({ ...db, database: "master" }).connect();
  await master.request().query(`IF DB_ID('${db.database}') IS NULL CREATE DATABASE [${db.database}]`);
  await master.close();
  console.log(`Database "${db.database}" is ready`);

  const pool = await new sql.ConnectionPool(db).connect();
  await pool.request().batch(fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8"));
  await pool.close();
  console.log("Tables are ready: Users, Elections, Candidates, Registrations, RelayLog");
}

main().catch((err) => {
  console.error("Database setup failed:", err.message);
  process.exitCode = 1;
});
