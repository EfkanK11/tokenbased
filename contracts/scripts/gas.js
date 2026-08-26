const { ethers } = require("hardhat");

async function main() {
  const [admin, instructor, student, s2, s3] = await ethers.getSigners();
  const INSTRUCTOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("INSTRUCTOR_ROLE")
  );

  const SuccessToken = await ethers.getContractFactory("SuccessToken");
  const token = await SuccessToken.deploy(admin.address);
  await token.waitForDeployment();
  const gToken = (await ethers.provider.getTransactionReceipt(
    token.deploymentTransaction().hash
  )).gasUsed;

  const RewardManager = await ethers.getContractFactory("RewardManager");
  const manager = await RewardManager.deploy(
    await token.getAddress(),
    admin.address
  );
  await manager.waitForDeployment();
  const gManager = (await ethers.provider.getTransactionReceipt(
    manager.deploymentTransaction().hash
  )).gasUsed;

  const AchievementBadge = await ethers.getContractFactory("AchievementBadge");
  const badge = await AchievementBadge.deploy(admin.address);
  await badge.waitForDeployment();
  const gBadge = (await ethers.provider.getTransactionReceipt(
    badge.deploymentTransaction().hash
  )).gasUsed;

  await (await token.transferOwnership(await manager.getAddress())).wait();
  await (await badge.transferOwnership(await manager.getAddress())).wait();
  await (await manager.setAchievementBadge(await badge.getAddress())).wait();
  await (await manager.grantRole(INSTRUCTOR_ROLE, instructor.address)).wait();

  async function measure(label, to, amount, ref) {
    const tx = await manager
      .connect(instructor)
      .approveActivity(to, ethers.parseEther(amount), ref);
    const r = await tx.wait();
    console.log(label.padEnd(28), r.gasUsed.toString());
    return r.gasUsed;
  }

  console.log("--- DEPLOY GAS ---");
  console.log("SuccessToken".padEnd(28), gToken.toString());
  console.log("RewardManager".padEnd(28), gManager.toString());
  console.log("AchievementBadge".padEnd(28), gBadge.toString());
  console.log("TOTAL DEPLOY".padEnd(28), (gToken + gManager + gBadge).toString());

  console.log("\n--- OPERATION GAS ---");
  await measure("approve, no badge (40)", student.address, "40", "act-a");
  await measure("approve + 1 badge (10)", student.address, "10", "act-b");
  await measure("approve + 3 badges (200)", s2.address, "200", "act-c");

  console.log("\n--- READ ---");
  const uri = await badge.tokenURI(1);
  console.log("tokenURI length (chars)".padEnd(28), uri.length);
  console.log("locked(1)".padEnd(28), await badge.locked(1));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
