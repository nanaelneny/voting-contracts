// scripts/deploy.js
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const Voting = await ethers.getContractFactory("Voting");
    const voting = await Voting.deploy();

    // ✅ Wait for deployment (Ethers v6)
    await voting.waitForDeployment();

    // ✅ Get deployed contract address (Ethers v6 uses .target)
    console.log("Voting contract deployed to:", voting.target);

    // Save contract address and ABI for frontend
    const frontendDir = path.join(__dirname, "../frontend/voting-frontend/src/contracts");
    if (!fs.existsSync(frontendDir)) {
        fs.mkdirSync(frontendDir, { recursive: true });
    }

    // Save address
    fs.writeFileSync(
        path.join(frontendDir, "contractAddress.json"),
        JSON.stringify({ address: voting.target }, null, 2) // ✅ use .target here
    );

    // Save ABI
    const artifact = await hre.artifacts.readArtifact("Voting");
    fs.writeFileSync(
        path.join(frontendDir, "Voting.json"),
        JSON.stringify(artifact, null, 2)
    );

    console.log("✅ Contract address & ABI saved for frontend.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
