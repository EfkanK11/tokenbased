require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const AMOY_RPC_URL = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      // viaIR lets the optimizer handle the deep abi.encodePacked chains in
      // AchievementBadge's on-chain SVG without "stack too deep".
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    amoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts: [DEPLOYER_PRIVATE_KEY],
    },
  },
  // Etherscan V2 unified API: a single key works across all chains (incl. Amoy).
  // V1 per-chain endpoints (api-amoy.polygonscan.com) were retired May 2025.
  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY || "",
  },
};
