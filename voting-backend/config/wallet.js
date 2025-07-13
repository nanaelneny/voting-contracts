const { ethers } = require("ethers");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
let privateKey = process.env.PRIVATE_KEY.trim();

if (privateKey.startsWith("0x")) {
    privateKey = privateKey.slice(2);
}

const wallet = new ethers.Wallet("0x" + privateKey, provider);

console.log("Wallet loaded successfully.");

module.exports = { provider, wallet };
