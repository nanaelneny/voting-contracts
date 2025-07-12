const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Railway PostgreSQL URL
    ssl: {
        rejectUnauthorized: false, // required for Railway
    },
});

pool.on("connect", () => {
    console.log("✅ Connected to PostgreSQL Database");
});

module.exports = { pool };

