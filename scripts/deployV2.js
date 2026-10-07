// Deploys VotingV2 and writes its address + ABI where the frontend and backend read them.
//
//   npx hardhat node                                         (terminal 1)
//   npx hardhat run scripts/deployV2.js --network localhost  (terminal 2)
//
// Set SEED_DEMO=true to also create a demo election that opens in 1 minute,
// with Hardhat accounts #1-#5 as approved voters. The voter tree is saved to
// deployments/demo-voters.json so proofs can be served later.
const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");
const { buildVoterTree } = require("./voterTree");

const ROOT = path.join(__dirname, "..");
const TARGETS = [
  path.join(ROOT, "frontend", "voting-frontend", "src", "contracts"),
  path.join(ROOT, "voting-backend", "abi"),
];

async function main() {
  const [admin, ...others] = await ethers.getSigners();
  console.log(`Deploying VotingV2 on "${network.name}" as ${admin.address}`);

  const voting = await ethers.deployContract("VotingV2", [admin.address]);
  await voting.waitForDeployment();
  const address = await voting.getAddress();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`VotingV2 deployed to ${address}`);

  const { abi } = await artifacts.readArtifact("VotingV2");
  for (const dir of TARGETS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "VotingV2.json"), JSON.stringify({ abi }, null, 2));
    fs.writeFileSync(
      path.join(dir, "VotingV2.address.json"),
      JSON.stringify({ address, chainId: Number(chainId), network: network.name }, null, 2)
    );
  }
  console.log("ABI and address written to frontend and backend");

  if (process.env.SEED_DEMO === "true") {
    const voters = others.slice(0, 5).map((s) => s.address);
    const tree = buildVoterTree(voters);
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await (await voting.createElection("Demo SRC Election", 0, now + 60, now + 60 + 3600)).wait();
    await (await voting.addCandidates(1, ["Isaac", "Gloria", "Rachael"])).wait();
    await (await voting.setVoterRoot(1, tree.root, tree.count)).wait();

    const outDir = path.join(ROOT, "deployments");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "demo-voters.json"), JSON.stringify(tree.dump(), null, 2));
    console.log(`Demo election 1 created; opens in 60s. Approved voters:\n  ${voters.join("\n  ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
