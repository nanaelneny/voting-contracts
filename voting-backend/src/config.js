// Reads settings from environment variables (.env). See .env.example.
require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

function loadConfig() {
  return {
    port: Number(process.env.PORT || 5000),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    jwtSecret: required("JWT_SECRET"),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",

    db: {
      server: required("DB_SERVER"),
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      database: required("DB_NAME"),
      user: required("DB_USER"),
      password: required("DB_PASSWORD"),
      options: {
        encrypt: process.env.DB_ENCRYPT === "true",
        trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
      },
    },

    chain: {
      rpcUrl: required("RPC_URL"),
      // Owns the VotingV2 contract: creates elections, adds candidates and voters.
      adminPrivateKey: required("ADMIN_PRIVATE_KEY"),
      // Pays gas for voters' ballots. Can be the same key as the admin for local testing.
      relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY || required("ADMIN_PRIVATE_KEY"),
      // Optional: defaults to abi/VotingV2.address.json written by the deploy script.
      contractAddress: process.env.CONTRACT_ADDRESS,
    },

    // Voting must open at least this long after publishing, so setup transactions can land.
    minPublishLeadSeconds: Number(process.env.MIN_PUBLISH_LEAD_SECONDS || 120),
    voterBatchSize: Number(process.env.VOTER_BATCH_SIZE || 100),
    relayRateLimitPerMinute: Number(process.env.RELAY_RATE_LIMIT_PER_MINUTE || 20),
  };
}

module.exports = { loadConfig };
