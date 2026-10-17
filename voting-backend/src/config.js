// Reads settings from environment variables (.env). See .env.example.
require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see .env.example)`);
  return value;
}

// Anyone who knows the login-token secret can make themselves an admin token, so a short or
// guessable one is refused. 32 characters is the minimum; the generator below gives 64.
function strongSecret(name) {
  const value = required(name);
  if (value.length < 32) {
    throw new Error(
      `${name} is too short (${value.length} characters, need at least 32). Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return value;
}

// MetaMask exports private keys without the "0x" at the start; ethers needs it.
const withHexPrefix = (key) => (key && !key.trim().startsWith("0x") ? `0x${key.trim()}` : key && key.trim());

function loadConfig() {
  return {
    port: Number(process.env.PORT || 5000),
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    jwtSecret: strongSecret("JWT_SECRET"),
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
      adminPrivateKey: withHexPrefix(required("ADMIN_PRIVATE_KEY")),
      // Pays gas for voters' ballots. Can be the same key as the admin for local testing.
      relayerPrivateKey: withHexPrefix(process.env.RELAYER_PRIVATE_KEY || required("ADMIN_PRIVATE_KEY")),
      // Optional: defaults to abi/VotingV2.address.json written by the deploy script.
      contractAddress: process.env.CONTRACT_ADDRESS,
      // Block explorer website, for receipt links. Known test networks are filled in automatically.
      explorerUrl: process.env.EXPLORER_URL,
    },

    // Voting must open at least this long after publishing, so setup transactions can land.
    minPublishLeadSeconds: Number(process.env.MIN_PUBLISH_LEAD_SECONDS || 120),
    voterBatchSize: Number(process.env.VOTER_BATCH_SIZE || 100),
    // The institution running the elections, shown on the website, e.g. "KNUST SRC". Optional.
    organisationName: (process.env.ORGANISATION_NAME || "").trim(),
    // What this institution calls its members' ID: "Student ID", "Staff number", "Membership number"...
    memberIdLabel: (process.env.MEMBER_ID_LABEL || "").trim() || "Member ID",
    // Sign-up only accepts emails at these domains, e.g. "st.knust.edu.gh" or "company.com". Empty = any.
    allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS || "")
      .split(",").map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean),
    // Fewest registered voters an election can be published with (see electionService.publish).
    minVoters: Number(process.env.MIN_VOTERS ?? 3),
    relayRateLimitPerMinute: Number(process.env.RELAY_RATE_LIMIT_PER_MINUTE || 20),
    // Password-guessing limits, per 15 minutes (see security.js).
    loginAttemptsPerAccount: Number(process.env.LOGIN_ATTEMPTS_PER_ACCOUNT || 5),
    loginAttemptsPerIp: Number(process.env.LOGIN_ATTEMPTS_PER_IP || 100),
    signupsPerIpPerHour: Number(process.env.SIGNUPS_PER_IP_PER_HOUR || 50),
    // Set when hosted behind a proxy, usually to 1 (the number of proxies in front). Empty locally.
    trustProxy: process.env.TRUST_PROXY ? (/^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY) : false,
  };
}

// Block explorers for the networks we deploy to, by chain ID.
const EXPLORERS = {
  84532: "https://sepolia.basescan.org", // Base Sepolia
  11155111: "https://sepolia.etherscan.io", // Ethereum Sepolia
};

module.exports = { loadConfig, EXPLORERS };
