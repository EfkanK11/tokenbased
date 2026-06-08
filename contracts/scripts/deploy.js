const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH\n"
  );

  // 1. Deploy SuccessToken (deployer is temporary owner)
  const SuccessToken = await ethers.getContractFactory("SuccessToken");
  const successToken = await SuccessToken.deploy(deployer.address);
  await successToken.waitForDeployment();
  const tokenAddress = await successToken.getAddress();
  console.log("SuccessToken deployed to: ", tokenAddress);

  // 2. Deploy RewardManager (points at the token, deployer is admin)
  const RewardManager = await ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.deploy(
    tokenAddress,
    deployer.address
  );
  await rewardManager.waitForDeployment();
  const managerAddress = await rewardManager.getAddress();
  console.log("RewardManager deployed to:", managerAddress);

  // 3. Transfer token ownership to RewardManager → only it can mint
  const tx1 = await successToken.transferOwnership(managerAddress);
  await tx1.wait();
  console.log("\nToken ownership transferred to RewardManager");

  // 4. Grant INSTRUCTOR_ROLE to deployer (so you can test minting yourself)
  const INSTRUCTOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("INSTRUCTOR_ROLE")
  );
  const tx2 = await rewardManager.grantRole(INSTRUCTOR_ROLE, deployer.address);
  await tx2.wait();
  console.log("INSTRUCTOR_ROLE granted to deployer:", deployer.address);

  // 5. Save deployed addresses so the frontend can read them
  const deployment = {
    network: "localhost",
    chainId: 31337,
    successToken: tokenAddress,
    rewardManager: managerAddress,
    admin: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  fs.writeFileSync(
    path.join(outDir, "localhost.json"),
    JSON.stringify(deployment, null, 2)
  );
  console.log("\nDeployment info saved to deployments/localhost.json");
  console.log("\n--- SUMMARY ---");
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
