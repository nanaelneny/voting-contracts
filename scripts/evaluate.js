// Measures how the voting system performs on a real network, for the evaluation chapter.
//
// It runs one complete test election against the deployed contract, using the same
// code as the backend (votingClient + relayService), and the same accounts (from
// voting-backend/.env):
//   1. creates an election, adds candidates and N voters      (admin pays)
//   2. each voter makes a zero-knowledge proof                (timed)
//   3. the relayer submits each ballot and waits for it       (timed, gas and fee recorded)
//   4. after voting closes, the result is finalized           (relayer pays)
//
// Results are saved in evaluation/results/ as a CSV (every transaction) and a
// Markdown summary (tables you can copy into the report).
//
//   npm run evaluate                         10 voters
//   VOTERS=20 npm run evaluate               more voters
//   ETH_PRICE_USD=2500 npm run evaluate      also show costs in US dollars
//
// Proof times here are measured in Node.js on this computer; the browser is usually
// somewhat slower.
const fs = require("fs");
const path = require("path");
const { Identity, Group, generateProof } = require("@semaphore-protocol/core");

const ROOT = path.join(__dirname, "..");
const BACKEND = path.join(ROOT, "voting-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({ path: path.join(BACKEND, ".env") });
const { Wallet, formatEther, formatUnits } = require(path.join(BACKEND, "node_modules", "ethers"));
const { createVotingClient } = require(path.join(BACKEND, "src", "chain", "votingClient"));
const { createProvider } = require(path.join(BACKEND, "src", "chain", "provider"));
const { parseProof } = require(path.join(BACKEND, "src", "services", "relayService"));
const { EXPLORERS } = require(path.join(BACKEND, "src", "config"));

const ARTIFACTS_DIR = path.dirname(require.resolve("@zk-kit/semaphore-artifacts/package.json"));
const NETWORK_NAMES = { 31337: "local-hardhat", 84532: "base-sepolia", 11155111: "ethereum-sepolia" };

const VOTERS = Number(process.env.VOTERS || 10);
const CANDIDATES = ["Ama Owusu", "Kofi Mensah", "Esi Boateng"];
// Setup transactions must land before voting opens; slower networks need longer.
const START_IN = Number(process.env.START_IN_SECONDS || 90);
const VOTING_SECONDS = Number(process.env.VOTING_SECONDS || Math.max(120, VOTERS * 20));
const ETH_PRICE_USD = process.env.ETH_PRICE_USD ? Number(process.env.ETH_PRICE_USD) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return null;
  const at = (p) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { n: v.length, mean: v.reduce((s, x) => s + x, 0) / v.length, median: at(0.5), p95: at(0.95), min: v[0], max: v[v.length - 1] };
}

/** Fee actually paid for a transaction, in wei. On L2s like Base this includes the L1 data fee. */
async function feeOf(provider, txHash) {
  const raw = await provider.send("eth_getTransactionReceipt", [txHash]);
  const gasUsed = BigInt(raw.gasUsed);
  const price = BigInt(raw.effectiveGasPrice);
  const l1Fee = raw.l1Fee ? BigInt(raw.l1Fee) : 0n;
  return { gasUsed, gasPrice: price, l2Fee: gasUsed * price, l1Fee, total: gasUsed * price + l1Fee };
}

async function waitForPhase(chain, id, want) {
  for (;;) {
    const { phase } = await chain.getElection(id);
    if (want.includes(phase)) return phase;
    await sleep(3000);
  }
}

async function main() {
  const abiDir = path.join(BACKEND, "abi");
  if (!fs.existsSync(path.join(abiDir, "VotingV2.address.json"))) throw new Error("No deployed contract. Deploy first (npm run deploy:local or deploy:base-sepolia).");
  const deployment = require(path.join(abiDir, "VotingV2.address.json"));
  const { abi } = require(path.join(abiDir, "VotingV2.json"));

  const provider = createProvider(process.env.RPC_URL);
  const chainId = Number((await provider.getNetwork()).chainId);
  const network = NETWORK_NAMES[chainId] || `chain-${chainId}`;
  const explorer = EXPLORERS[chainId];
  const withPrefix = (k) => (k && !k.startsWith("0x") ? `0x${k}` : k);
  const admin = new Wallet(withPrefix(process.env.ADMIN_PRIVATE_KEY.trim()), provider);
  const relayer = new Wallet(withPrefix((process.env.RELAYER_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY).trim()), provider);
  const chain = createVotingClient({ address: deployment.address, abi, adminSigner: admin, relayerSigner: relayer });

  const [adminStart, relayerStart] = await Promise.all([provider.getBalance(admin.address), provider.getBalance(relayer.address)]);
  log(`Network ${network} (chain ${chainId}), contract ${deployment.address}`);
  log(`Admin   ${admin.address}  ${formatEther(adminStart)} ETH`);
  log(`Relayer ${relayer.address}  ${formatEther(relayerStart)} ETH`);
  if (relayerStart === 0n || adminStart === 0n) throw new Error("Admin and relayer both need some test ETH.");
  log(`${VOTERS} voters, ${CANDIDATES.length} candidates, voting opens in ${START_IN}s for ${VOTING_SECONDS}s`);

  const rows = []; // one per transaction, for the CSV

  // ── 1. Setup (admin) ──
  const identities = Array.from({ length: VOTERS }, () => new Identity());
  const start = new Date(Date.now() + START_IN * 1000);
  const end = new Date(start.getTime() + VOTING_SECONDS * 1000);
  let t = Date.now();
  const electionId = await chain.createElection({ title: `Evaluation run ${new Date().toISOString()}`, offchainId: 0, startTime: start, endTime: end });
  rows.push({ step: "createElection", ms: Date.now() - t });
  t = Date.now();
  await chain.addCandidates(electionId, CANDIDATES);
  rows.push({ step: "addCandidates", ms: Date.now() - t });
  t = Date.now();
  await chain.addVoters(electionId, identities.map((i) => i.commitment.toString()));
  rows.push({ step: `addVoters (${VOTERS})`, ms: Date.now() - t });
  const setupCost = adminStart - (await provider.getBalance(admin.address));
  log(`Election #${electionId} set up. Admin paid ${formatEther(setupCost)} ETH`);

  // ── 2 + 3. Voting (proofs + relayed ballots) ──
  log("Waiting for voting to open…");
  await waitForPhase(chain, electionId, ["voting"]);
  const group = new Group(identities.map((i) => i.commitment));
  const scope = await chain.scopeOf(electionId);
  const depth = Math.max(group.depth, 1);
  const artifacts = { wasm: path.join(ARTIFACTS_DIR, `semaphore-${depth}.wasm`), zkey: path.join(ARTIFACTS_DIR, `semaphore-${depth}.zkey`) };

  for (let i = 0; i < VOTERS; i++) {
    const choice = i % CANDIDATES.length;
    const row = { step: "vote", voter: i + 1, candidate: choice };
    try {
      let t0 = performance.now();
      const proof = await generateProof(identities[i], group, choice, scope, depth, artifacts);
      row.proofMs = Math.round(performance.now() - t0);

      t0 = performance.now();
      const result = await chain.relayVote(electionId, parseProof({ proof }));
      row.ms = Math.round(performance.now() - t0);
      row.txHash = result.txHash;
      Object.assign(row, await feeOf(provider, result.txHash));
      log(`Vote ${i + 1}/${VOTERS}: proof ${row.proofMs} ms, confirmed in ${row.ms} ms, gas ${row.gasUsed}`);
    } catch (err) {
      row.error = err.code || err.message;
      log(`Vote ${i + 1}/${VOTERS} FAILED: ${row.error}`);
    }
    rows.push(row);
  }

  // A second ballot from the same voter must be refused, and cost nothing.
  const before = await provider.getBalance(relayer.address);
  const again = await generateProof(identities[0], group, 0, scope, depth, artifacts);
  let doubleVote = "accepted (unexpected!)";
  try {
    await chain.relayVote(electionId, parseProof({ proof: again }));
  } catch (err) {
    doubleVote = `refused (${err.code})`;
  }
  const doubleVoteCost = before - (await provider.getBalance(relayer.address));
  log(`Double vote: ${doubleVote}, cost ${formatEther(doubleVoteCost)} ETH`);

  // ── 4. Finalize ──
  log(`Waiting for voting to close (${end.toISOString().slice(11, 19)})…`);
  await waitForPhase(chain, electionId, ["ended", "finalized"]);
  t = Date.now();
  const fin = await chain.finalize(electionId);
  rows.push({ step: "finalize", ms: Date.now() - t, txHash: fin.txHash, ...(await feeOf(provider, fin.txHash)) });
  const tally = await chain.getCandidates(electionId);
  log(`Finalized: ${tally.map((c) => `${c.name} ${c.voteCount}`).join(", ")}`);

  // ── Save ──
  const votes = rows.filter((r) => r.step === "vote" && r.txHash);
  const failed = rows.filter((r) => r.step === "vote" && r.error).length;
  const eth = (wei) => Number(formatEther(wei));
  const money = (wei) => (ETH_PRICE_USD ? ` (≈ $${(eth(wei) * ETH_PRICE_USD).toFixed(6)})` : "");
  const fmt = (x, d = 0) => (x == null ? "" : Number(x).toFixed(d));

  const proof = stats(votes.map((r) => r.proofMs));
  const latency = stats(votes.map((r) => r.ms));
  const gas = stats(votes.map((r) => Number(r.gasUsed)));
  const fee = stats(votes.map((r) => eth(r.total)));
  const relayerSpent = relayerStart - (await provider.getBalance(relayer.address));

  const outDir = path.join(ROOT, "evaluation", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = path.join(outDir, `${network}-${stamp}`);

  const cols = ["step", "voter", "candidate", "proofMs", "ms", "gasUsed", "gasPrice", "l2Fee", "l1Fee", "total", "txHash", "error"];
  fs.writeFileSync(`${base}.csv`, [cols.join(","), ...rows.map((r) => cols.map((c) => (r[c] ?? "").toString()).join(","))].join("\n") + "\n");

  const line = (label, s, unit, d = 0) => `| ${label} | ${fmt(s?.mean, d)} | ${fmt(s?.median, d)} | ${fmt(s?.p95, d)} | ${fmt(s?.min, d)} | ${fmt(s?.max, d)} | ${unit} |`;
  const md = `# Evaluation run: ${network}

- Date: ${new Date().toISOString()}
- Contract: \`${deployment.address}\`${explorer ? ` ([explorer](${explorer}/address/${deployment.address}))` : ""}
- Election #${electionId}: ${VOTERS} voters, ${CANDIDATES.length} candidates
- Votes accepted: ${votes.length} of ${VOTERS}${failed ? ` (${failed} failed)` : ""}
- Double vote by the same voter: ${doubleVote}, cost to relayer ${formatEther(doubleVoteCost)} ETH
- Final tally: ${tally.map((c) => `${c.name} ${c.voteCount}`).join(", ")}

## Per vote

| Measure | Mean | Median | 95th pct | Min | Max | Unit |
|---|---|---|---|---|---|---|
${line("Proof generation (Node.js)", proof, "ms")}
${line("Submit → confirmed", latency, "ms")}
${line("Gas used", gas, "gas")}
${line("Fee paid by relayer", fee, "ETH", 10)}

## Totals

| Item | Cost |
|---|---|
| Setup by admin (create election, ${CANDIDATES.length} candidates, ${VOTERS} voters) | ${formatEther(setupCost)} ETH${money(setupCost)} |
| All votes + finalize, paid by relayer | ${formatEther(relayerSpent)} ETH${money(relayerSpent)} |
| Paid by voters | 0 ETH |
${ETH_PRICE_USD ? `\nUSD figures assume 1 ETH = $${ETH_PRICE_USD}. Test-network ETH has no real value; these show what the same transactions would cost at this gas price.\n` : ""}
## Setup and finalize times

| Step | Time (ms) |
|---|---|
${rows.filter((r) => r.step !== "vote").map((r) => `| ${r.step} | ${r.ms} |`).join("\n")}
`;
  fs.writeFileSync(`${base}.md`, md);
  console.log(`\n${md}`);
  log(`Saved ${path.relative(ROOT, base)}.csv and .md`);
}

main().catch((err) => {
  console.error("Evaluation failed:", err.message);
  process.exitCode = 1;
});
