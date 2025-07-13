const sql = require("mssql");
require("dotenv").config();

const dbConfig = {
    user: process.env.DB_USER, // e.g., 'sa'
    password: process.env.DB_PASSWORD, // e.g., 'yourStrong(!)Password'
    server: process.env.DB_SERVER, // e.g., 'localhost'
    database: process.env.DB_NAME, // e.g., 'VotingDB'
    options: {
        encrypt: true, // Azure = true, Local = false
        trustServerCertificate: true // true for dev
    }
};

// Create connection pool
const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log("✅ Connected to SQL Server");
        return pool;
    })
    .catch(err => {
        console.error("❌ Database connection failed:", err);
        process.exit(1);
    });

// Helper query function
async function query(sqlQuery, params = {}) {
    const pool = await poolPromise;
    const request = pool.request();

    // Add parameters safely
    for (const key in params) {
        request.input(key, params[key]);
    }

    return request.query(sqlQuery);
}

module.exports = {
    sql,
    poolPromise,
    query // 🟢 Export the helper function
};
