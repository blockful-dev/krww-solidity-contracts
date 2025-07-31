const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("sWONDER (ERC4626)", function () {
  let WONDER, sWONDER;
  let wonder, sWonder;
  let owner, vaultManager, pauser, blacklistManager, user1, user2;

  const VAULT_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_MANAGER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLIST_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE"));
  const COOLDOWN_PERIOD = 7 * 24 * 60 * 60; // 7 days in seconds

  beforeEach(async function () {
    [owner, vaultManager, pauser, blacklistManager, user1, user2] = await ethers.getSigners();
    
    // Deploy WONDER token
    WONDER = await ethers.getContractFactory("WONDER");
    wonder = await WONDER.deploy(owner.address);
    
    // Deploy sWONDER vault token (ERC4626)
    sWONDER = await ethers.getContractFactory("sWONDER");
    sWonder = await sWONDER.deploy(owner.address, await wonder.getAddress());
    
    // Grant roles
    await sWonder.connect(owner).grantRole(VAULT_MANAGER_ROLE, vaultManager.address);
    await sWonder.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await sWonder.connect(owner).grantRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address);
    
    // Mint some WONDER tokens to users for testing
    const wonderAmount = ethers.parseEther("10000"); // 10000 WONDER with 18 decimals
    await wonder.connect(owner).mint(user1.address, wonderAmount);
    await wonder.connect(owner).mint(user2.address, wonderAmount);
    await wonder.connect(owner).mint(vaultManager.address, wonderAmount);
  });

  describe("ERC4626 Deployment", function () {
    it("Should set the right name, symbol and decimals", async function () {
      expect(await sWonder.name()).to.equal("Staked Ethena WONDER");
      expect(await sWonder.symbol()).to.equal("sWONDER");
      expect(await sWonder.decimals()).to.equal(18);
    });

    it("Should set the correct asset (WONDER) token address", async function () {
      expect(await sWonder.asset()).to.equal(await wonder.getAddress());
    });

    it("Should grant all roles to the owner", async function () {
      const DEFAULT_ADMIN_ROLE = await sWonder.DEFAULT_ADMIN_ROLE();
      expect(await sWonder.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await sWonder.hasRole(VAULT_MANAGER_ROLE, owner.address)).to.be.true;
      expect(await sWonder.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
      expect(await sWonder.hasRole(BLACKLIST_MANAGER_ROLE, owner.address)).to.be.true;
    });

    it("Should start with zero total supply and assets", async function () {
      expect(await sWonder.totalSupply()).to.equal(0);
      expect(await sWonder.totalAssets()).to.equal(0);
    });

    it("Should set correct cooldown period and reward rate", async function () {
      expect(await sWonder.COOLDOWN_PERIOD()).to.equal(COOLDOWN_PERIOD);
      expect(await sWonder.rewardRate()).to.equal(1000); // 10% APY
    });
  });

  describe("ERC4626 Deposit", function () {
    it("Should allow users to deposit WONDER tokens", async function () {
      const depositAmount = ethers.parseEther("1000");
      
      // Approve sWONDER to spend WONDER
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      
      // Calculate expected shares (1:1 for first deposit)
      const expectedShares = await sWonder.previewDeposit(depositAmount);
      
      await expect(sWonder.connect(user1).deposit(depositAmount, user1.address))
        .to.emit(sWonder, "Deposit")
        .withArgs(user1.address, user1.address, depositAmount, expectedShares);

      expect(await sWonder.balanceOf(user1.address)).to.equal(expectedShares);
      expect(await sWonder.totalSupply()).to.equal(expectedShares);
      expect(await sWonder.totalAssets()).to.equal(depositAmount);
    });

    it("Should track deposit timestamp", async function () {
      const depositAmount = ethers.parseEther("1000");
      
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      
      const tx = await sWonder.connect(user1).deposit(depositAmount, user1.address);
      const receipt = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
      
      expect(await sWonder.getDepositTimestamp(user1.address)).to.equal(blockTimestamp);
    });

    it("Should revert deposit from blacklisted address", async function () {
      const depositAmount = ethers.parseEther("1000");
      
      await sWonder.connect(blacklistManager).blacklist(user1.address);
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      
      await expect(sWonder.connect(user1).deposit(depositAmount, user1.address))
        .to.be.revertedWithCustomError(sWonder, "BlacklistedAccount");
    });
  });

  describe("ERC4626 Mint", function () {
    it("Should allow users to mint shares", async function () {
      const mintShares = ethers.parseEther("1000");
      
      // Calculate required assets
      const requiredAssets = await sWonder.previewMint(mintShares);
      
      await wonder.connect(user1).approve(await sWonder.getAddress(), requiredAssets);
      
      await expect(sWonder.connect(user1).mint(mintShares, user1.address))
        .to.emit(sWonder, "Deposit")
        .withArgs(user1.address, user1.address, requiredAssets, mintShares);

      expect(await sWonder.balanceOf(user1.address)).to.equal(mintShares);
      expect(await sWonder.totalSupply()).to.equal(mintShares);
    });
  });

  describe("ERC4626 Withdraw", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseEther("1000");
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      await sWonder.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should allow withdrawal after cooldown period", async function () {
      const withdrawAmount = ethers.parseEther("500");
      
      // Fast forward time by cooldown period
      await time.increase(COOLDOWN_PERIOD);
      
      const expectedShares = await sWonder.previewWithdraw(withdrawAmount);
      
      await expect(sWonder.connect(user1).withdraw(withdrawAmount, user1.address, user1.address))
        .to.emit(sWonder, "Withdraw")
        .withArgs(user1.address, user1.address, user1.address, withdrawAmount, expectedShares);

      expect(await sWonder.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
      expect(await wonder.balanceOf(user1.address)).to.equal(ethers.parseEther("9500")); // 10000 - 1000 + 500
    });

    it("Should revert withdrawal before cooldown period", async function () {
      const withdrawAmount = ethers.parseEther("500");
      
      await expect(sWonder.connect(user1).withdraw(withdrawAmount, user1.address, user1.address))
        .to.be.revertedWithCustomError(sWonder, "CooldownNotMet");
    });

    it("Should calculate cooldown remaining correctly", async function () {
      const halfCooldown = COOLDOWN_PERIOD / 2;
      
      // Fast forward half the cooldown period
      await time.increase(halfCooldown);
      
      const remaining = await sWonder.getCooldownRemaining(user1.address);
      expect(remaining).to.be.closeTo(halfCooldown, 5); // Allow 5 second tolerance
    });
  });

  describe("ERC4626 Redeem", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseEther("1000");
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      await sWonder.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should allow redeem after cooldown period", async function () {
      const redeemShares = ethers.parseEther("500");
      
      // Fast forward time by cooldown period
      await time.increase(COOLDOWN_PERIOD);
      
      const expectedAssets = await sWonder.previewRedeem(redeemShares);
      
      await expect(sWonder.connect(user1).redeem(redeemShares, user1.address, user1.address))
        .to.emit(sWonder, "Withdraw")
        .withArgs(user1.address, user1.address, user1.address, expectedAssets, redeemShares);

      expect(await sWonder.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should revert redeem before cooldown period", async function () {
      const redeemShares = ethers.parseEther("500");
      
      await expect(sWonder.connect(user1).redeem(redeemShares, user1.address, user1.address))
        .to.be.revertedWithCustomError(sWonder, "CooldownNotMet");
    });
  });

  describe("ERC4626 Preview Functions", function () {
    it("Should preview deposit correctly", async function () {
      const depositAmount = ethers.parseEther("1000");
      const previewShares = await sWonder.previewDeposit(depositAmount);
      
      // For first deposit, should be 1:1
      expect(previewShares).to.equal(depositAmount);
    });

    it("Should preview mint correctly", async function () {
      const mintShares = ethers.parseEther("1000");
      const previewAssets = await sWonder.previewMint(mintShares);
      
      // For first mint, should be 1:1
      expect(previewAssets).to.equal(mintShares);
    });
  });

  describe("Reward Distribution", function () {
    it("Should allow vault manager to distribute rewards", async function () {
      const rewardAmount = ethers.parseEther("100");
      
      await wonder.connect(vaultManager).approve(await sWonder.getAddress(), rewardAmount);
      
      await expect(sWonder.connect(vaultManager).distributeRewards(rewardAmount))
        .to.emit(sWonder, "RewardsDistributed")
        .withArgs(rewardAmount);
      
      expect(await sWonder.totalAssets()).to.equal(rewardAmount);
    });

    it("Should not allow non-vault manager to distribute rewards", async function () {
      const rewardAmount = ethers.parseEther("100");
      
      await expect(sWonder.connect(user1).distributeRewards(rewardAmount))
        .to.be.revertedWithCustomError(sWonder, "AccessControlUnauthorizedAccount");
    });

    it("Should allow setting reward rate", async function () {
      const newRate = 1500; // 15%
      
      await expect(sWonder.connect(vaultManager).setRewardRate(newRate))
        .to.emit(sWonder, "RewardRateUpdated")
        .withArgs(1000, newRate);
      
      expect(await sWonder.rewardRate()).to.equal(newRate);
    });
  });

  describe("Blacklisting", function () {
    it("Should allow blacklist manager to blacklist address", async function () {
      await expect(sWonder.connect(blacklistManager).blacklist(user1.address))
        .to.emit(sWonder, "Blacklisted")
        .withArgs(user1.address);

      expect(await sWonder.isBlacklisted(user1.address)).to.be.true;
    });

    it("Should prevent transfers from blacklisted address", async function () {
      const depositAmount = ethers.parseEther("1000");
      
      // Deposit first
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      await sWonder.connect(user1).deposit(depositAmount, user1.address);
      
      // Then blacklist
      await sWonder.connect(blacklistManager).blacklist(user1.address);
      
      await expect(sWonder.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(sWonder, "BlacklistedAccount");
    });
  });

  describe("Pausing", function () {
    it("Should allow pauser to pause the contract", async function () {
      await sWonder.connect(pauser).pause();
      expect(await sWonder.paused()).to.be.true;
    });

    it("Should prevent deposits when paused", async function () {
      const depositAmount = ethers.parseEther("1000");
      
      await sWonder.connect(pauser).pause();
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      
      await expect(sWonder.connect(user1).deposit(depositAmount, user1.address))
        .to.be.revertedWithCustomError(sWonder, "EnforcedPause");
    });
  });

  describe("ERC4626 Max Functions", function () {
    it("Should return correct max deposit", async function () {
      const maxDeposit = await sWonder.maxDeposit(user1.address);
      expect(maxDeposit).to.equal(ethers.MaxUint256);
    });

    it("Should return correct max mint", async function () {
      const maxMint = await sWonder.maxMint(user1.address);
      expect(maxMint).to.equal(ethers.MaxUint256);
    });

    it("Should return zero max withdraw/redeem before cooldown", async function () {
      const depositAmount = ethers.parseEther("1000");
      await wonder.connect(user1).approve(await sWonder.getAddress(), depositAmount);
      await sWonder.connect(user1).deposit(depositAmount, user1.address);
      
      // Before cooldown, should not be able to withdraw/redeem
      expect(await sWonder.maxWithdraw(user1.address)).to.equal(0);
      expect(await sWonder.maxRedeem(user1.address)).to.equal(0);
    });
  });
});