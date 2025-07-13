const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);

let privateKey = process.env.PRIVATE_KEY.trim();
if (privateKey.startsWith("0x")) {
    privateKey = privateKey.slice(2);
}

let wallet;
try {
    wallet = new ethers.Wallet("0x" + privateKey, provider);
    console.log("Wallet loaded successfully.");
} catch (err) {
    console.error("Failed to load wallet:", err);
    process.exit(1);
}

// 🟢 Load ABI properly
const contractArtifact = require("./contractABI.json"); // Hardhat artifact
const contractABI = contractArtifact.abi; // ✅ Extract abi
const contractAddress = process.env.CONTRACT_ADDRESS;

const votingContract = new ethers.Contract(contractAddress, contractABI, wallet);

module.exports = votingContract;
