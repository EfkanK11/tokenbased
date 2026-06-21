// Demo seed: approve a few activities for the student account so the
// Student panel shows balance, history, and auto-minted badges.
// Localhost only. Run after deploy.js against the running hardhat node.
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", "localhost.json"))
  );
  const [instructor] = await ethers.getSigners();
  const STUDENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat Account #1

  const manager = await ethers.getContractAt(
    "RewardManager",
    deployment.rewardManager
  );

  // Cumulative: 30 -> 55 (L1 Active Member) -> 105 (L2 Star Performer)
  //          -> 205 (L3 Campus Legend). Shows all three badge tiers.
  const activities = [
    { amount: "30", ref: "workshop-blockchain-101" },
    { amount: "25", ref: "hackathon-spring-2026" },
    { amount: "50", ref: "research-poster-symposium" },
    { amount: "100", ref: "capstone-demo-day" },
  ];

  for (const a of activities) {
    const tx = await manager.approveActivity(
      STUDENT,
      ethers.parseEther(a.amount),
      a.ref
    );
    await tx.wait();
    console.log(`Approved ${a.amount} SCT  ·  ${a.ref}`);
  }

  const badge = await ethers.getContractAt(
    "AchievementBadge",
    deployment.achievementBadge
  );
  const bal = await badge.balanceOf(STUDENT);
  console.log(`\nStudent ${STUDENT}`);
  console.log(`Badges minted: ${bal.toString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
