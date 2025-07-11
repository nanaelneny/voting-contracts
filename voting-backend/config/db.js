const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: "postgresql://postgres:ZmZdtFMoBFfClgfmXdzyEXVAlTlQzLYT@interchange.proxy.rlwy.net:44330/railway", // Railway PostgreSQL URL
    ssl: {
        rejectUnauthorized: false, // required for Railway
    },
});

pool.on("connect", () => {
    console.log("✅ Connected to PostgreSQL Database");
});

module.exports = { pool };

