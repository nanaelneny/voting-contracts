// Runs the API WITHOUT SQL Server, keeping everything in memory, for demos and testing.
// Data is lost when it stops. Needs the local blockchain running and the contracts deployed:
//   npm run node            (project root, terminal 1)
//   npm run deploy:local    (project root, terminal 2)
//   npm run demo            (voting-backend, terminal 3)
//
// Log in as admin@demo.test / demo-admin-123
const path = require("path");
const bcrypt = require("bcryptjs");
const { Wallet } = require("ethers");
const { createApp } = require("../src/app");
const { createMemoryRepository } = require("../src/db/memoryRepository");
const { createVotingClient } = require("../src/chain/votingClient");
const { createProvider } = require("../src/chain/provider");

const HARDHAT_ADMIN = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_RELAYER = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

async function main() {
  const abiDir = path.join(__dirname, "..", "abi");
  if (!require("fs").existsSync(path.join(abiDir, "VotingV2.address.json"))) {
    throw new Error('Contract not deployed yet. Run "npm run deploy:local" in the project root first.');
  }
  const deployment = require(path.join(abiDir, "VotingV2.address.json"));
  const { abi } = require(path.join(abiDir, "VotingV2.json"));
  const provider = createProvider(process.env.RPC_URL || "http://127.0.0.1:8545");
  const network = await provider.getNetwork();

  // Deployments are recorded per chain; make sure the contract really exists on this one.
  if ((await provider.getCode(deployment.address)) === "0x") {
    throw new Error(`No contract at ${deployment.address}. Run "npm run deploy:local" in the project root first.`);
  }

  const config = {
    jwtSecret: "demo-only-secret",
    jwtExpiresIn: "8h",
    corsOrigin: "http://localhost:3000",
    minPublishLeadSeconds: Number(process.env.MIN_PUBLISH_LEAD_SECONDS || 60),
    voterBatchSize: 100,
    relayRateLimitPerMinute: 100,
  };

  const repo = createMemoryRepository();
  await repo.createUser({ fullName: "Demo Election Officer", email: "admin@demo.test", passwordHash: await bcrypt.hash("demo-admin-123", 10), role: "admin" });

  const chain = createVotingClient({
    address: deployment.address,
    abi,
    adminSigner: new Wallet(HARDHAT_ADMIN, provider),
    relayerSigner: new Wallet(HARDHAT_RELAYER, provider),
  });

  const app = createApp({ repo, chain, config, chainInfo: { chainId: Number(network.chainId) } });
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => {
    console.log(`Demo API (in-memory, no SQL Server) on http://localhost:${port}`);
    console.log("Admin login: admin@demo.test / demo-admin-123");
  });
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exitCode = 1;
});
