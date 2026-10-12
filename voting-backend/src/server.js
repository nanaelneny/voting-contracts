// Starts the API with the real SQL Server database and blockchain.
//   npm start        (or: npm run dev  to restart on file changes)
const { Wallet } = require("ethers");
const { loadConfig, EXPLORERS } = require("./config");
const { createApp } = require("./app");
const { createMssqlRepository } = require("./db/mssqlRepository");
const { createVotingClient } = require("./chain/votingClient");
const { createProvider } = require("./chain/provider");
const { findDeployment } = require("./chain/deployment");

async function main() {
  const config = loadConfig();

  const provider = createProvider(config.chain.rpcUrl);
  const network = await provider.getNetwork();
  const { address, abi } = findDeployment(Number(network.chainId), config.chain.contractAddress);
  if ((await provider.getCode(address)) === "0x") {
    throw new Error(`No contract at ${address} on chain ${network.chainId}. Was the local blockchain restarted? Deploy again.`);
  }
  const chain = createVotingClient({
    address,
    abi,
    adminSigner: new Wallet(config.chain.adminPrivateKey, provider),
    relayerSigner: new Wallet(config.chain.relayerPrivateKey, provider),
    voterBatchSize: config.voterBatchSize,
  });

  const repo = await createMssqlRepository(config.db);
  await warnIfChainWasReset(repo, chain);
  const chainId = Number(network.chainId);
  const explorerUrl = config.chain.explorerUrl || EXPLORERS[chainId] || null;
  const app = createApp({ repo, chain, config, chainInfo: { chainId, explorerUrl } });

  app.listen(config.port, () => {
    console.log(`Voting API on http://localhost:${config.port}  (contract ${address}, chain ${network.chainId})`);
  });
}

/** Warns if the database lists elections that the blockchain doesn't have (e.g. after restarting the local chain). */
async function warnIfChainWasReset(repo, chain) {
  const onChain = await chain.electionCount();
  const missing = (await repo.listElections()).filter((e) => e.chainElectionId && e.chainElectionId > onChain);
  if (missing.length > 0) {
    console.warn(
      `\n⚠  ${missing.length} published election(s) in the database aren't on this blockchain ` +
        `(was the local blockchain restarted?). Run "npm run db:reset" to clear them.\n`
    );
  }
}

main().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exitCode = 1;
});
