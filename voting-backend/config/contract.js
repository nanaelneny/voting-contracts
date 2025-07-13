const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

// Replace with your contract ABI & address
const contractABI = require("./contractABI.json"); // Put ABI JSON in the same folder
const contractAddress = process.env.CONTRACT_ADDRESS;

const votingContract = new ethers.Contract(contractAddress, contractABI, wallet);

module.exports = votingContract;
