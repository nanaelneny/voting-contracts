// Puts the latest Base Sepolia and Ethereum Sepolia evaluation runs side by side, and
// estimates what the same election would cost on the REAL networks (mainnets) today.
//
//   ETH_PRICE_USD=2521.67 npm run compare
//
// Why estimate? Test-network fees say little about real costs: test ETH is free, so
// test networks are nearly empty and their gas prices are close to zero. Gas USED
// (the amount of work) is the same on test and real networks with the same rules,
// so: estimated real fee = gas used (measured) × today's real gas price (fetched now).
//
// Base, like other "rollups", also pays to store its transactions on Ethereum (the
// "L1 data fee"). For Base mainnet that fee is asked from Base's own fee contract.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "voting-backend");
const { JsonRpcProvider, Contract, Interface, Transaction, Wallet, formatEther, formatUnits, hexlify, randomBytes } =
  require(path.join(BACKEND, "node_modules", "ethers"));

const RESULTS = path.join(ROOT, "evaluation", "results");
const ETH_PRICE_USD = process.env.ETH_PRICE_USD ? Number(process.env.ETH_PRICE_USD.replace(/[$,\s]/g, "")) || null : null;
const MAINNET_RPC = {
  ethereum: process.env.ETHEREUM_MAINNET_RPC || "https://ethereum-rpc.publicnode.com",
  base: process.env.BASE_MAINNET_RPC || "https://mainnet.base.org",
};
// Base's fee contract (same address on every OP Stack network).
const GAS_PRICE_ORACLE = "0x420000000000000000000000000000000000000F";

function latestCsv(network) {
  if (!fs.existsSync(RESULTS)) return null;
  const files = fs.readdirSync(RESULTS).filter((f) => f.startsWith(`${network}-`) && f.endsWith(".csv")).sort();
  return files.length ? path.join(RESULTS, files[files.length - 1]) : null;
}

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
}

const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.ceil(s.length / 2) - 1] : null;
};
const p95 = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] : null;
};

function summarise(network) {
  const file = latestCsv(network);
  if (!file) return null;
  const rows = readCsv(file);
  const votes = rows.filter((r) => r.step === "vote" && r.txHash);
  const setup = rows.filter((r) => /^(createElection|addCandidates|addVoters)/.test(r.step));
  const finalize = rows.find((r) => r.step === "finalize");
  const voters = Number((rows.find((r) => r.step.startsWith("addVoters"))?.step.match(/\d+/) || [votes.length])[0]);
  const setupGas = setup.every((r) => r.gasUsed) && setup.length ? setup.reduce((s, r) => s + Number(r.gasUsed), 0) : null;
  return {
    file: path.basename(file),
    voters,
    votes: votes.length,
    latencyMedian: median(votes.map((r) => Number(r.ms))),
    latencyP95: p95(votes.map((r) => Number(r.ms))),
    proofMedian: median(votes.map((r) => Number(r.proofMs))),
    gasMedian: median(votes.map((r) => Number(r.gasUsed))),
    gasTotalVotes: votes.reduce((s, r) => s + Number(r.gasUsed), 0),
    testFeeMedian: median(votes.map((r) => Number(formatEther(BigInt(r.total))))),
    testGasPriceGwei: median(votes.map((r) => Number(formatUnits(BigInt(r.gasPrice), "gwei")))),
    setupGas,
    finalizeGas: finalize?.gasUsed ? Number(finalize.gasUsed) : null,
  };
}

/** A realistic vote transaction (random proof values, which compress like real ones). */
function sampleVoteTx() {
  const iface = new Interface([
    "function vote(uint256 electionId, (uint256 merkleTreeDepth, uint256 merkleTreeRoot, uint256 nullifier, uint256 message, uint256 scope, uint256[8] points) proof)",
  ]);
  const word = () => BigInt(hexlify(randomBytes(31)));
  const data = iface.encodeFunctionData("vote", [1, [4, word(), word(), 1, word(), Array.from({ length: 8 }, word)]]);
  return Transaction.from({
    type: 2, chainId: 8453, nonce: 1234, to: Wallet.createRandom().address, data,
    gasLimit: 450000, maxFeePerGas: 10n ** 9n, maxPriorityFeePerGas: 10n ** 6n,
  }).unsignedSerialized;
}

async function mainnetPrices() {
  const out = { fetchedAt: new Date().toISOString() };
  try {
    const eth = new JsonRpcProvider(MAINNET_RPC.ethereum);
    out.ethGasPrice = (await eth.getFeeData()).gasPrice;
    eth.destroy();
  } catch (err) {
    out.ethError = err.message;
  }
  try {
    const base = new JsonRpcProvider(MAINNET_RPC.base);
    out.baseGasPrice = (await base.getFeeData()).gasPrice;
    const oracle = new Contract(GAS_PRICE_ORACLE, ["function getL1Fee(bytes) view returns (uint256)"], base);
    out.baseL1FeePerVote = await oracle.getL1Fee(sampleVoteTx());
    base.destroy();
  } catch (err) {
    out.baseError = err.message;
  }
  return out;
}

async function main() {
  const base = summarise("base-sepolia");
  const eth = summarise("ethereum-sepolia");
  if (!base || !eth) throw new Error("Need one evaluation run on each network first (npm run evaluate on Base Sepolia and on Ethereum Sepolia).");

  console.log("Fetching today's real-network gas prices…");
  const live = await mainnetPrices();

  const usd = (ethAmount) => (ETH_PRICE_USD && ethAmount != null ? `$${(ethAmount * ETH_PRICE_USD).toFixed(4)}` : "—");
  const ethStr = (x) => (x == null ? "—" : x.toExponential(2));
  const gwei = (wei) => (wei == null ? "—" : Number(formatUnits(wei, "gwei")).toPrecision(3));

  // Real-network estimates, per vote and for a whole election (setup + all votes + finalize).
  // Gas units: Ethereum mainnet still runs the rules Base runs today, so Base's measured gas
  // is the right amount for "Ethereum today". Sepolia already has the Glamsterdam upgrade
  // (October 2026), whose gas repricing makes the same vote use more gas; that amount is
  // shown as "after Glamsterdam".
  const ethPrice = live.ethGasPrice != null ? Number(formatEther(live.ethGasPrice)) : null; // ETH per gas
  const basePrice = live.baseGasPrice != null ? Number(formatEther(live.baseGasPrice)) : null;
  const baseL1 = live.baseL1FeePerVote != null ? Number(formatEther(live.baseL1FeePerVote)) : null;

  const perVote = {
    base: basePrice != null && baseL1 != null ? base.gasMedian * basePrice + baseL1 : null,
    ethToday: ethPrice != null ? base.gasMedian * ethPrice : null,
    ethGlamsterdam: ethPrice != null ? eth.gasMedian * ethPrice : null,
  };
  const electionGas = (s) => (s.setupGas != null && s.finalizeGas != null ? s.setupGas + s.gasTotalVotes + s.finalizeGas : null);
  const perElection = {
    // L1 data fee for setup/finalize transactions approximated by the per-vote figure (they're similar-sized or smaller).
    base: basePrice != null && baseL1 != null && electionGas(base) != null ? electionGas(base) * basePrice + baseL1 * (base.votes + 4) : null,
    ethToday: ethPrice != null && electionGas(base) != null ? electionGas(base) * ethPrice : null,
  };

  const md = `# Base vs Ethereum: comparison

Runs compared: \`${base.file}\` and \`${eth.file}\`
Real-network gas prices fetched ${live.fetchedAt}${ETH_PRICE_USD ? `; 1 ETH = $${ETH_PRICE_USD}` : ""}.

## Measured on the test networks

| Measure (median per vote) | Base Sepolia (L2) | Ethereum Sepolia (L1) |
|---|---|---|
| Proof generation (Node.js) | ${base.proofMedian} ms | ${eth.proofMedian} ms |
| Submit → confirmed | ${(base.latencyMedian / 1000).toFixed(1)} s | ${(eth.latencyMedian / 1000).toFixed(1)} s |
| Submit → confirmed, 95th percentile | ${(base.latencyP95 / 1000).toFixed(1)} s | ${(eth.latencyP95 / 1000).toFixed(1)} s |
| Gas used | ${base.gasMedian} | ${eth.gasMedian} |
| Test-network gas price | ${base.testGasPriceGwei.toPrecision(3)} gwei | ${eth.testGasPriceGwei.toPrecision(3)} gwei |
| Test-network fee | ${ethStr(base.testFeeMedian)} ETH | ${ethStr(eth.testFeeMedian)} ETH |

Test-network fees are not real costs: test ETH is free, so these networks are nearly
empty and their gas prices are close to zero. The real-network estimate below is the
fair comparison.

## Estimated cost on the real networks today

| | Base mainnet (L2) | Ethereum mainnet (L1) |
|---|---|---|
| Gas price now | ${gwei(live.baseGasPrice)} gwei (+ L1 data fee ${ethStr(baseL1)} ETH per vote) | ${gwei(live.ethGasPrice)} gwei |
| One vote | ${ethStr(perVote.base)} ETH (${usd(perVote.base)}) | ${ethStr(perVote.ethToday)} ETH (${usd(perVote.ethToday)}) |
| Whole election (${base.voters} voters: setup, votes, finalize) | ${ethStr(perElection.base)} ETH (${usd(perElection.base)}) | ${ethStr(perElection.ethToday)} ETH (${usd(perElection.ethToday)}) |
| One vote after Ethereum's Glamsterdam gas changes | — | ${ethStr(perVote.ethGlamsterdam)} ETH (${usd(perVote.ethGlamsterdam)}) |
${perVote.base && perVote.ethToday ? `\nOn today's prices a vote costs about **${(perVote.ethToday / perVote.base).toFixed(0)}×** more on Ethereum than on Base.\n` : ""}${live.ethError || live.baseError ? `\nCould not fetch some prices: ${[live.ethError, live.baseError].filter(Boolean).join("; ")}\n` : ""}${electionGas(base) == null ? "\nWhole-election estimates need a run made with the newer evaluation script (it records setup gas).\n" : ""}
### How the estimates are made
- Gas used comes from the measured runs. Ethereum mainnet hasn't had the Glamsterdam upgrade yet, so it uses the same gas rules as Base: the Base run's gas is used for "Ethereum today".
- Sepolia already has Glamsterdam (activated 6 October 2026), which reprices some operations; that's why the same vote used more gas there.
- Real gas prices change minute to minute; re-run \`npm run compare\` to refresh them.
`;

  fs.mkdirSync(RESULTS, { recursive: true });
  const out = path.join(RESULTS, `comparison-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`);
  fs.writeFileSync(out, md);
  console.log(`\n${md}`);
  console.log(`Saved ${path.relative(ROOT, out)}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("Comparison failed:", err.message);
    process.exit(1);
  }
);
