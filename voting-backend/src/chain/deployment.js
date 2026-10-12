// Finds the VotingV2 contract for the blockchain we're connected to.
//
// The deploy script records one address per network (by chain ID) in abi/deployments.json,
// so you can switch between the local chain, Base Sepolia and Ethereum Sepolia just by
// changing RPC_URL in .env.
const fs = require("fs");
const path = require("path");

const ABI_DIR = path.join(__dirname, "..", "..", "abi");

function readJson(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

/**
 * @param chainId   the chain the provider is connected to
 * @param override  CONTRACT_ADDRESS from .env, if set
 * @returns {{ address: string, abi: any[] }}
 */
function findDeployment(chainId, override) {
  const abiFile = readJson(path.join(ABI_DIR, "VotingV2.json"));
  if (!abiFile) throw new Error('Contract not deployed yet. Run a deploy command in the project root first (e.g. "npm run deploy:local").');

  if (override) return { address: override, abi: abiFile.abi };

  const all = readJson(path.join(ABI_DIR, "deployments.json")) || {};
  if (all[chainId]) return { address: all[chainId].address, abi: abiFile.abi };

  // Older deploys wrote a single address file; use it if it's for this chain.
  const single = readJson(path.join(ABI_DIR, "VotingV2.address.json"));
  if (single && Number(single.chainId) === Number(chainId)) return { address: single.address, abi: abiFile.abi };

  const known = Object.entries(all).map(([id, d]) => `${d.network} (chain ${id})`).join(", ") || "none";
  throw new Error(
    `No contract deployed on chain ${chainId}. Deployed on: ${known}. ` +
      "Check RPC_URL in voting-backend/.env, or deploy to this network first."
  );
}

/** Records a new deployment (called by the deploy script). */
function saveDeployment({ abi, chainId, ...info }) {
  fs.mkdirSync(ABI_DIR, { recursive: true });
  const file = path.join(ABI_DIR, "deployments.json");
  const all = readJson(file) || {};
  // Keep a deployment recorded by the older single-file format before it's overwritten below.
  const single = readJson(path.join(ABI_DIR, "VotingV2.address.json"));
  if (single?.chainId && !all[single.chainId]) {
    const { chainId: oldChain, ...oldInfo } = single;
    all[oldChain] = oldInfo;
  }
  all[chainId] = { ...info, deployedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
  fs.writeFileSync(path.join(ABI_DIR, "VotingV2.json"), JSON.stringify({ abi }, null, 2));
  // Kept for anything that still reads the single "latest deployment" file.
  fs.writeFileSync(path.join(ABI_DIR, "VotingV2.address.json"), JSON.stringify({ ...info, chainId }, null, 2));
}

module.exports = { findDeployment, saveDeployment, ABI_DIR };
