const fs = require('fs');
const path = require('path');

async function main() {
  const Voting = await ethers.getContractFactory("Voting");
  const voting = await Voting.deploy();
  await voting.waitForDeployment();

  const address = await voting.getAddress();
  console.log(`✅ Voting contract deployed to: ${address}`);

  // Save ABI and address to frontend/src/contracts/
  const frontendContractsDir = path.join(__dirname, '..', 'frontend', 'src', 'contracts');

  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  // Write address
  fs.writeFileSync(
    path.join(frontendContractsDir, 'contractAddress.json'),
    JSON.stringify({ Voting: address }, null, 2)
  );

  // Write ABI
  const artifact = await artifacts.readArtifact("Voting");
  fs.writeFileSync(
    path.join(frontendContractsDir, 'Voting.json'),
    JSON.stringify(artifact, null, 2)
  );

  console.log('📦 ABI and contract address saved to frontend/src/contracts');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
