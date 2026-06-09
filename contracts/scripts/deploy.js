const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Network:         ", network.name);
  console.log("Deploying with:  ", deployer.address);
  console.log(
    "Account balance: ",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "MATIC/ETH\n"
  );

  // 1. Deploy SuccessToken
  const SuccessToken = await ethers.getContractFactory("SuccessToken");
  const successToken = await SuccessToken.deploy(deployer.address);
  await successToken.waitForDeployment();
  const tokenAddress = await successToken.getAddress();
  console.log("SuccessToken deployed to: ", tokenAddress);

  // 2. Deploy RewardManager
  const RewardManager = await ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.deploy(
    tokenAddress,
    deployer.address
  );
  await rewardManager.waitForDeployment();
  const managerAddress = await rewardManager.getAddress();
  console.log("RewardManager deployed to:", managerAddress);

  // 3. Transfer token ownership to RewardManager
  const tx1 = await successToken.transferOwnership(managerAddress);
  await tx1.wait();
  console.log("\nToken ownership transferred to RewardManager");

  // 4. Grant INSTRUCTOR_ROLE to deployer
  const INSTRUCTOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("INSTRUCTOR_ROLE")
  );
  const tx2 = await rewardManager.grantRole(INSTRUCTOR_ROLE, deployer.address);
  await tx2.wait();
  console.log("INSTRUCTOR_ROLE granted to deployer:", deployer.address);

  // 5. Save deployment info
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    successToken: tokenAddress,
    rewardManager: managerAddress,
    admin: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment info saved to deployments/${network.name}.json`);
  console.log("\n--- SUMMARY ---");
  console.log(JSON.stringify(deployment, null, 2));

  // 6. Print verify commands
  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\n--- VERIFY COMMANDS (run after deploy) ---");
    console.log(`npx hardhat verify --network ${network.name} ${tokenAddress} "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network.name} ${managerAddress} "${tokenAddress}" "${deployer.address}"`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
