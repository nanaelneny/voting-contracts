const sql = require("mssql");
require("dotenv").config();

const config = {
    user: "nanaelneny",
    password: "Gedysqnysonic",
    server: "localhost",
    database: "voting_system",
    options: {
        encrypt: false, // set to true for Azure
        trustServerCertificate: true,
        enableArithAbort: true,
    },
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log("✅ Connected to SQL Server");
        return pool;
    })
    .catch(err => console.log("❌ Database Connection Failed: ", err));

module.exports = { sql, poolPromise };
