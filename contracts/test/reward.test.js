const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Token-Based Success Award System", function () {
  let successToken, rewardManager, achievementBadge;
  let admin, instructor, student, outsider;

  const INSTRUCTOR_ROLE = ethers.keccak256(
    ethers.toUtf8Bytes("INSTRUCTOR_ROLE")
  );
  const REWARD = ethers.parseEther("10");

  beforeEach(async function () {
    [admin, instructor, student, outsider] = await ethers.getSigners();

    const SuccessToken = await ethers.getContractFactory("SuccessToken");
    successToken = await SuccessToken.deploy(admin.address);
    await successToken.waitForDeployment();

    const RewardManager = await ethers.getContractFactory("RewardManager");
    rewardManager = await RewardManager.deploy(
      await successToken.getAddress(),
      admin.address
    );
    await rewardManager.waitForDeployment();

    await successToken.transferOwnership(await rewardManager.getAddress());

    const AchievementBadge = await ethers.getContractFactory("AchievementBadge");
    achievementBadge = await AchievementBadge.deploy(admin.address);
    await achievementBadge.waitForDeployment();
    await achievementBadge.transferOwnership(await rewardManager.getAddress());
    await rewardManager.setAchievementBadge(await achievementBadge.getAddress());

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
      ).to.be.reverted;
    });

    it("reverts direct mint by anyone other than the owner", async function () {
      await expect(
        successToken.connect(instructor).mint(student.address, REWARD)
      ).to.be.reverted;
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

  describe("Achievement badges (ERC-721)", function () {
    function award(amount) {
      return rewardManager
        .connect(instructor)
        .approveActivity(student.address, ethers.parseEther(amount), "act");
    }

    it("wires badge ownership to RewardManager", async function () {
      expect(await achievementBadge.owner()).to.equal(
        await rewardManager.getAddress()
      );
    });

    it("seeds three default milestones", async function () {
      expect(await rewardManager.milestoneCount()).to.equal(3n);
    });

    it("mints no badge below the first threshold (50 SCT)", async function () {
      await award("40");
      expect(await achievementBadge.balanceOf(student.address)).to.equal(0n);
    });

    it("awards level-1 badge on crossing 50 SCT", async function () {
      await award("50");
      expect(await achievementBadge.balanceOf(student.address)).to.equal(1n);
      expect(await achievementBadge.levelOf(1)).to.equal(1n);
      expect(await achievementBadge.nameOf(1)).to.equal("Active Member");
    });

    it("emits BadgeAwarded with correct args", async function () {
      await expect(award("50"))
        .to.emit(rewardManager, "BadgeAwarded")
        .withArgs(student.address, 0, 1, "Active Member");
    });

    it("tracks cumulative earnings across approvals", async function () {
      await award("30");
      await award("30");
      expect(await rewardManager.totalEarned(student.address)).to.equal(
        ethers.parseEther("60")
      );
      expect(await achievementBadge.balanceOf(student.address)).to.equal(1n);
    });

    it("awards multiple badges when a single approval jumps tiers", async function () {
      await award("200");
      expect(await achievementBadge.balanceOf(student.address)).to.equal(3n);
    });

    it("never awards the same milestone twice", async function () {
      await award("50");
      await award("50");
      expect(await achievementBadge.balanceOf(student.address)).to.equal(2n);
    });

    it("produces a base64 JSON tokenURI", async function () {
      await award("50");
      const uri = await achievementBadge.tokenURI(1);
      expect(uri).to.match(/^data:application\/json;base64,/);
    });

    it("skips badge minting when no badge contract is wired", async function () {
      const SuccessToken = await ethers.getContractFactory("SuccessToken");
      const token2 = await SuccessToken.deploy(admin.address);
      await token2.waitForDeployment();

      const RewardManager = await ethers.getContractFactory("RewardManager");
      const mgr2 = await RewardManager.deploy(
        await token2.getAddress(),
        admin.address
      );
      await mgr2.waitForDeployment();
      await token2.transferOwnership(await mgr2.getAddress());
      await mgr2.grantRole(INSTRUCTOR_ROLE, instructor.address);

      await mgr2
        .connect(instructor)
        .approveActivity(student.address, ethers.parseEther("100"), "act");

      expect(await token2.balanceOf(student.address)).to.equal(
        ethers.parseEther("100")
      );
      expect(await mgr2.totalEarned(student.address)).to.equal(
        ethers.parseEther("100")
      );
    });
  });

  describe("Badge access control", function () {
    it("reverts direct badge mint by non-owner", async function () {
      await expect(
        achievementBadge
          .connect(instructor)
          .mint(student.address, 1, "Hacker Badge")
      ).to.be.reverted;
    });

    it("reverts setAchievementBadge by non-admin", async function () {
      await expect(
        rewardManager
          .connect(outsider)
          .setAchievementBadge(await achievementBadge.getAddress())
      ).to.be.reverted;
    });
  });

  describe("Soulbound badges (ERC-5192)", function () {
    beforeEach(async function () {
      await rewardManager
        .connect(instructor)
        .approveActivity(student.address, ethers.parseEther("50"), "act-1");
    });

    it("reports locked() = true for a minted badge", async function () {
      expect(await achievementBadge.locked(1)).to.equal(true);
    });

    it("reverts locked() for a nonexistent token", async function () {
      await expect(achievementBadge.locked(999)).to.be.reverted;
    });

    it("blocks transferFrom (non-transferable)", async function () {
      await expect(
        achievementBadge
          .connect(student)
          .transferFrom(student.address, outsider.address, 1)
      ).to.be.revertedWithCustomError(achievementBadge, "Soulbound");
    });

    it("blocks safeTransferFrom (non-transferable)", async function () {
      await expect(
        achievementBadge
          .connect(student)
          ["safeTransferFrom(address,address,uint256)"](
            student.address,
            outsider.address,
            1
          )
      ).to.be.revertedWithCustomError(achievementBadge, "Soulbound");
    });

    it("declares ERC-5192 interface support", async function () {
      expect(
        await achievementBadge.supportsInterface("0xb45a3c0e")
      ).to.equal(true);
    });

    it("emits Locked on mint", async function () {
      await expect(
        rewardManager
          .connect(instructor)
          .approveActivity(student.address, ethers.parseEther("50"), "act-2")
      )
        .to.emit(achievementBadge, "Locked")
        .withArgs(2);
    });
  });
});
