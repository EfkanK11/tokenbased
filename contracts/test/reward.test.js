const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Token-Based Success Award System", function () {
  let successToken, rewardManager;
  let admin, instructor, student, outsider;

  const INSTRUCTOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("INSTRUCTOR_ROLE")
  );
  const REWARD = ethers.parseEther("10"); // 10 SCT

  // Fresh deploy before each test → isolated state
  beforeEach(async function () {
    [admin, instructor, student, outsider] = await ethers.getSigners();

    // 1. Deploy SuccessToken, admin is temporary owner
    const SuccessToken = await ethers.getContractFactory("SuccessToken");
    successToken = await SuccessToken.deploy(admin.address);
    await successToken.waitForDeployment();

    // 2. Deploy RewardManager pointing at the token, admin holds admin role
    const RewardManager = await ethers.getContractFactory("RewardManager");
    rewardManager = await RewardManager.deploy(
      await successToken.getAddress(),
      admin.address
    );
    await rewardManager.waitForDeployment();

    // 3. Transfer token ownership to RewardManager → only it can mint
    await successToken.transferOwnership(await rewardManager.getAddress());

    // 4. Admin grants INSTRUCTOR_ROLE to the instructor account
    await rewardManager.grantRole(INSTRUCTOR_ROLE, instructor.address);
  });

  describe("Deployment & setup", function () {
    it("sets correct token name and symbol", async function () {
      expect(await successToken.name()).to.equal("SuccessToken");
      expect(await successToken.symbol()).to.equal("SCT");
    });

    it("makes RewardManager the token owner", async function () {
      expect(await successToken.owner()).to.equal(
        await rewardManager.getAddress()
      );
    });

    it("grants instructor the INSTRUCTOR_ROLE", async function () {
      expect(
        await rewardManager.hasRole(INSTRUCTOR_ROLE, instructor.address)
      ).to.equal(true);
    });
  });

  describe("approveActivity (minting)", function () {
    it("instructor can approve → mints tokens to student", async function () {
      await rewardManager
        .connect(instructor)
        .approveActivity(student.address, REWARD, "event-001");

      expect(await successToken.balanceOf(student.address)).to.equal(REWARD);
    });

    it("emits ActivityApproved with correct args", async function () {
      await expect(
        rewardManager
          .connect(instructor)
          .approveActivity(student.address, REWARD, "event-001")
      )
        .to.emit(rewardManager, "ActivityApproved")
        .withArgs(instructor.address, student.address, REWARD, "event-001");
    });

    it("accumulates balance across multiple approvals", async function () {
      await rewardManager
        .connect(instructor)
        .approveActivity(student.address, REWARD, "event-001");
      await rewardManager
        .connect(instructor)
        .approveActivity(student.address, REWARD, "event-002");

      expect(await successToken.balanceOf(student.address)).to.equal(
        REWARD * 2n
      );
    });
  });

  describe("Access control (security)", function () {
    it("reverts when a non-instructor tries to approve", async function () {
      await expect(
        rewardManager
          .connect(outsider)
          .approveActivity(student.address, REWARD, "event-001")
      ).to.be.reverted; // missing INSTRUCTOR_ROLE
    });

    it("reverts direct mint by anyone other than the owner", async function () {
      await expect(
        successToken.connect(instructor).mint(student.address, REWARD)
      ).to.be.reverted; // RewardManager is owner, instructor is not
    });

    it("admin can revoke INSTRUCTOR_ROLE → instructor loses access", async function () {
      await rewardManager.revokeRole(INSTRUCTOR_ROLE, instructor.address);

      await expect(
        rewardManager
          .connect(instructor)
          .approveActivity(student.address, REWARD, "event-001")
      ).to.be.reverted;
    });
  });

  describe("Input validation", function () {
    it("reverts on zero amount", async function () {
      await expect(
        rewardManager
          .connect(instructor)
          .approveActivity(student.address, 0, "event-001")
      ).to.be.revertedWith("RewardManager: amount must be > 0");
    });

    it("reverts on empty activity reference", async function () {
      await expect(
        rewardManager
          .connect(instructor)
          .approveActivity(student.address, REWARD, "")
      ).to.be.revertedWith("RewardManager: empty activity reference");
    });

    it("reverts on zero student address", async function () {
      await expect(
        rewardManager
          .connect(instructor)
          .approveActivity(ethers.ZeroAddress, REWARD, "event-001")
      ).to.be.revertedWith("RewardManager: zero student address");
    });
  });
});
