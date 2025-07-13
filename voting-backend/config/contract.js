const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
let privateKey = process.env.PRIVATE_KEY.trim();

// Remove leading 0x if it exists
if (privateKey.startsWith("0x")) {
    privateKey = privateKey.slice(2);
}

try {
    const wallet = new ethers.Wallet("0x" + privateKey, provider);
    console.log("Wallet loaded successfully.");
} catch (err) {
    console.error("Failed to load wallet:", err);
    process.exit(1);
}


// Replace with your contract ABI & address
const contractABI = require("./contractABI.json"); // Put ABI JSON in the same folder
const contractAddress = process.env.CONTRACT_ADDRESS;

const votingContract = new ethers.Contract(contractAddress, contractABI, wallet);

module.exports = votingContract;
