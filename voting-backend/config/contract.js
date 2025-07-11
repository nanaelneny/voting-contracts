const { ethers } = require("ethers");
require("dotenv").config();

// ✅ Connect to blockchain RPC
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// ✅ Load wallet using private key
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// ✅ Load the Voting contract ABI
const contractABI = require("../abi/Voting.json").abi;

// ✅ Use deployed contract address
const contractAddress = process.env.CONTRACT_ADDRESS;

// ✅ Create contract instance
const votingContract = new ethers.Contract(contractAddress, contractABI, wallet);

console.log("✅ Connected to Voting Smart Contract");

module.exports = votingContract;
