// Deploys VotingV2 (and, on a local chain, the Semaphore contracts it uses),
// then writes the address + ABI where the frontend and backend read them.
//
//   npx hardhat node                                         (terminal 1)
//   npx hardhat run scripts/deployV2.js --network localhost  (terminal 2)
//
// SEMAPHORE_ADDRESS=0x...  reuse an existing Semaphore deployment (e.g. the
//                          official one on a public testnet) instead of deploying it.
// SEED_DEMO=true           also create a demo election that opens in 1 minute with
//                          5 registered voters. Their identities are saved to
//                          deployments/demo-identities.json. Those contain voter
//                          SECRETS and exist only for local testing.
const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");
const { Identity } = require("@semaphore-protocol/core");

const ROOT = path.join(__dirname, "..");
const TARGETS = [
  path.join(ROOT, "frontend", "voting-frontend", "src", "contracts"),
  path.join(ROOT, "voting-backend", "abi"),
];

async function deploySemaphoreStack() {
  const poseidon = await ethers.deployContract("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
  const verifier = await ethers.deployContract("SemaphoreVerifier");
  const semaphore = await ethers.deployContract("Semaphore", [await verifier.getAddress()], {
    libraries: { "poseidon-solidity/PoseidonT3.sol:PoseidonT3": await poseidon.getAddress() },
  });
  await semaphore.waitForDeployment();
  return semaphore.getAddress();
}

async function main() {
  const [admin] = await ethers.getSigners();
  console.log(`Deploying on "${network.name}" as ${admin.address}`);

  let semaphoreAddress = process.env.SEMAPHORE_ADDRESS;
  if (semaphoreAddress) {
    console.log(`Using existing Semaphore at ${semaphoreAddress}`);
  } else {
    semaphoreAddress = await deploySemaphoreStack();
    console.log(`Semaphore deployed to ${semaphoreAddress}`);
  }

  const voting = await ethers.deployContract("VotingV2", [admin.address, semaphoreAddress]);
  await voting.waitForDeployment();
  const address = await voting.getAddress();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`VotingV2 deployed to ${address}`);

  const { abi } = await artifacts.readArtifact("VotingV2");
  const info = { address, semaphore: semaphoreAddress, chainId: Number(chainId), network: network.name };
  for (const dir of TARGETS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "VotingV2.json"), JSON.stringify({ abi }, null, 2));
    fs.writeFileSync(path.join(dir, "VotingV2.address.json"), JSON.stringify(info, null, 2));
  }
  console.log("ABI and addresses written to frontend and backend");

  if (process.env.SEED_DEMO === "true") {
    const identities = Array.from({ length: 5 }, () => new Identity());
    const now = (await ethers.provider.getBlock("latest")).timestamp;

    await (await voting.createElection("Demo SRC Election", 0, now + 60, now + 60 + 3600)).wait();
    await (await voting.addCandidates(1, ["Isaac", "Gloria", "Rachael"])).wait();
    await (await voting.addVoters(1, identities.map((i) => i.commitment))).wait();

    const outDir = path.join(ROOT, "deployments");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "demo-identities.json"),
      JSON.stringify(identities.map((i) => ({ privateKey: i.export(), commitment: i.commitment.toString() })), null, 2)
    );
    console.log("Demo election 1 created; opens in 60s with 5 registered voters (deployments/demo-identities.json)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
