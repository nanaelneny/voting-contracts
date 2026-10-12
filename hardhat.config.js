require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Public test networks. The key is the admin account's private key, kept in .env (never committed).
// MetaMask exports keys without the "0x" at the start, so add it if it's missing.
const withHexPrefix = (key) => (key && !key.startsWith("0x") ? `0x${key}` : key);
const DEPLOYER_PRIVATE_KEY = withHexPrefix(process.env.DEPLOYER_PRIVATE_KEY?.trim());
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const publicNet = (url) => (DEPLOYER_PRIVATE_KEY ? { url, accounts: [DEPLOYER_PRIVATE_KEY] } : { url });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // "npm run node" sets HARDHAT_INTERVAL_MINING so the local chain mines a block every
    // 3 seconds, like a real network. Without it, an idle local chain's clock stands
    // still and elections never appear to open or close. Tests don't set it.
    hardhat: process.env.HARDHAT_INTERVAL_MINING ? { mining: { auto: true, interval: 3000 } } : {},
    localhost: { url: "http://127.0.0.1:8545" },
    baseSepolia: publicNet(BASE_SEPOLIA_RPC_URL), // Base's test network (an Ethereum L2)
    sepolia: publicNet(SEPOLIA_RPC_URL), // Ethereum's own test network
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
