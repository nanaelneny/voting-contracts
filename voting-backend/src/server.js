// Starts the API with the real SQL Server database and blockchain.
//   npm start        (or: npm run dev  to restart on file changes)
const path = require("path");
const { Wallet } = require("ethers");
const { loadConfig } = require("./config");
const { createApp } = require("./app");
const { createMssqlRepository } = require("./db/mssqlRepository");
const { createVotingClient } = require("./chain/votingClient");
const { createProvider } = require("./chain/provider");

async function main() {
  const config = loadConfig();

  const abiDir = path.join(__dirname, "..", "abi");
  if (!require("fs").existsSync(path.join(abiDir, "VotingV2.address.json"))) {
    throw new Error('Contract not deployed yet. Run "npm run deploy:local" in the project root first.');
  }
  const deployment = require(path.join(abiDir, "VotingV2.address.json"));
  const { abi } = require(path.join(abiDir, "VotingV2.json"));
  const address = config.chain.contractAddress || deployment.address;

  const provider = createProvider(config.chain.rpcUrl);
  const network = await provider.getNetwork();
  const chain = createVotingClient({
    address,
    abi,
    adminSigner: new Wallet(config.chain.adminPrivateKey, provider),
    relayerSigner: new Wallet(config.chain.relayerPrivateKey, provider),
    voterBatchSize: config.voterBatchSize,
  });

  const repo = await createMssqlRepository(config.db);
  const app = createApp({ repo, chain, config, chainInfo: { chainId: Number(network.chainId) } });

  app.listen(config.port, () => {
    console.log(`Voting API on http://localhost:${config.port}  (contract ${address}, chain ${network.chainId})`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exitCode = 1;
});
