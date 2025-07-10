const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Load the ABI and Contract Address
const contractABI = require("../artifacts/contracts/Voting.sol/Voting.json").abi;
const contractAddress = process.env.CONTRACT_ADDRESS;

// Create contract instance
const votingContract = new ethers.Contract(contractAddress, contractABI, wallet);

module.exports = votingContract;
