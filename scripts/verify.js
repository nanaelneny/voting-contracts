// Publishes VotingV2's source code on the block explorer (basescan / etherscan), so anyone
// can read the contract and check that the blockchain runs exactly this code.
//
//   npm run verify:base-sepolia
//   npm run verify:sepolia
//
// Needs a free Etherscan API key in the root .env as ETHERSCAN_API_KEY (one key works for
// both Basescan and Etherscan).
const { ethers, network, run } = require("hardhat");
const { findDeployment } = require("../voting-backend/src/chain/deployment");

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) {
    throw new Error("Put your Etherscan API key in the .env file in the project root as ETHERSCAN_API_KEY.");
  }
  const { chainId } = await ethers.provider.getNetwork();
  const { address, abi } = findDeployment(Number(chainId));

  // The same values the contract was deployed with, read back from the contract itself.
  const voting = new ethers.Contract(address, abi, ethers.provider);
  const [owner, semaphore] = await Promise.all([voting.owner(), voting.semaphore()]);
  console.log(`Verifying VotingV2 at ${address} on "${network.name}" (owner ${owner}, Semaphore ${semaphore})`);

  try {
    await run("verify:verify", { address, constructorArguments: [owner, semaphore] });
  } catch (err) {
    if (/already verified/i.test(err.message)) {
      console.log("Already verified.");
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
