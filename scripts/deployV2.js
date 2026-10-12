// Deploys VotingV2 (and, on a local chain, the Semaphore contracts it uses),
// then writes the address + ABI where the backend reads them.
//
//   npm run node          (terminal 1)
//   npm run deploy:local  (terminal 2)
//
// On public networks it uses the Semaphore contract the Semaphore team already
// deployed (same address on every network they support), so only VotingV2 is deployed.
// SEMAPHORE_ADDRESS=0x...  use a different Semaphore deployment instead.
const fs = require("fs");
const path = require("path");
const { ethers, artifacts, network } = require("hardhat");

const ROOT = path.join(__dirname, "..");
// Only the backend talks to the contract; the frontend goes through the backend.
const TARGETS = [path.join(ROOT, "voting-backend", "abi")];
// https://docs.semaphore.pse.dev/deployed-contracts
const OFFICIAL_SEMAPHORE = "0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D";
const LOCAL_NETWORKS = ["hardhat", "localhost"];

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
  if (!admin) throw new Error("No deployer key. Put DEPLOYER_PRIVATE_KEY in the .env file in the project root.");
  console.log(`Deploying on "${network.name}" as ${admin.address}`);

  let semaphoreAddress =
    process.env.SEMAPHORE_ADDRESS || (LOCAL_NETWORKS.includes(network.name) ? null : OFFICIAL_SEMAPHORE);
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
  console.log("ABI and address written to voting-backend/abi");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
