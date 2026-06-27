const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();

  const overrides =
    network.name === "amoy" ? { gasPrice: ethers.parseUnits("25", "gwei") } : {};

  console.log("Network:         ", network.name);
  console.log("Deploying with:  ", deployer.address);
  console.log(
    "Account balance: ",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "MATIC/ETH\n"
  );

  const SuccessToken = await ethers.getContractFactory("SuccessToken");
  const successToken = await SuccessToken.deploy(deployer.address, overrides);
  await successToken.waitForDeployment();
  const tokenAddress = await successToken.getAddress();
  console.log("SuccessToken deployed to: ", tokenAddress);

  const RewardManager = await ethers.getContractFactory("RewardManager");
  const rewardManager = await RewardManager.deploy(
    tokenAddress,
    deployer.address,
    overrides
  );
  await rewardManager.waitForDeployment();
  const managerAddress = await rewardManager.getAddress();
  console.log("RewardManager deployed to:", managerAddress);

  const AchievementBadge = await ethers.getContractFactory("AchievementBadge");
  const achievementBadge = await AchievementBadge.deploy(deployer.address, overrides);
  await achievementBadge.waitForDeployment();
  const badgeAddress = await achievementBadge.getAddress();
  console.log("AchievementBadge deployed to:", badgeAddress);

  const tx1 = await successToken.transferOwnership(managerAddress, overrides);
  await tx1.wait();
  console.log("\nToken ownership transferred to RewardManager");

  const tx2 = await achievementBadge.transferOwnership(managerAddress, overrides);
  await tx2.wait();
  console.log("Badge ownership transferred to RewardManager");

  const tx3 = await rewardManager.setAchievementBadge(badgeAddress, overrides);
  await tx3.wait();
  console.log("AchievementBadge wired into RewardManager");

  const INSTRUCTOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("INSTRUCTOR_ROLE")
  );
  const tx4 = await rewardManager.grantRole(INSTRUCTOR_ROLE, deployer.address, overrides);
  await tx4.wait();
  console.log("INSTRUCTOR_ROLE granted to deployer:", deployer.address);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const deployBlock = await ethers.provider.getBlockNumber();
  const deployment = {
    network: network.name,
    chainId: Number(chainId),
    successToken: tokenAddress,
    rewardManager: managerAddress,
    achievementBadge: badgeAddress,
    admin: deployer.address,
    deployBlock,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const outFile = path.join(outDir, `${network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\nDeployment info saved to deployments/${network.name}.json`);
  console.log("\n--- SUMMARY ---");
  console.log(JSON.stringify(deployment, null, 2));

  if (network.name !== "localhost" && network.name !== "hardhat") {
    console.log("\n--- VERIFY COMMANDS (run after deploy) ---");
    console.log(`npx hardhat verify --network ${network.name} ${tokenAddress} "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network.name} ${managerAddress} "${tokenAddress}" "${deployer.address}"`);
    console.log(`npx hardhat verify --network ${network.name} ${badgeAddress} "${deployer.address}"`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
