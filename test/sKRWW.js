const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("sKRWW (ERC4626)", function () {
  let KRWW, sKRWW;
  let krww, sKrww;
  let owner, vaultManager, pauser, blacklistManager, user1, user2;

  const VAULT_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("VAULT_MANAGER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLIST_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE"));
  const COOLDOWN_PERIOD = 7 * 24 * 60 * 60; // 7 days in seconds

  beforeEach(async function () {
    [owner, vaultManager, pauser, blacklistManager, user1, user2] = await ethers.getSigners();
    
    // Deploy KRWW token
    KRWW = await ethers.getContractFactory("KRWW");
    krww = await KRWW.deploy(owner.address);
    
    // Deploy sKRWW vault token (ERC4626)
    sKRWW = await ethers.getContractFactory("sKRWW");
    sKrww = await sKRWW.deploy(owner.address, await krww.getAddress());
    
    // Grant roles
    await sKrww.connect(owner).grantRole(VAULT_MANAGER_ROLE, vaultManager.address);
    await sKrww.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await sKrww.connect(owner).grantRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address);
    
    // Mint some KRWW tokens to users for testing
    const krwwAmount = ethers.parseUnits("10000", 2); // 10000 KRWW with 2 decimals
    await krww.connect(owner).mint(user1.address, krwwAmount);
    await krww.connect(owner).mint(user2.address, krwwAmount);
    await krww.connect(owner).mint(vaultManager.address, krwwAmount);
  });

  describe("ERC4626 Deployment", function () {
    it("Should set the right name, symbol and decimals", async function () {
      expect(await sKrww.name()).to.equal("Staked Korean Won Wonder");
      expect(await sKrww.symbol()).to.equal("sKRWW");
      expect(await sKrww.decimals()).to.equal(2);
    });

    it("Should set the correct asset (KRWW) token address", async function () {
      expect(await sKrww.asset()).to.equal(await krww.getAddress());
    });

    it("Should grant all roles to the owner", async function () {
      const DEFAULT_ADMIN_ROLE = await sKrww.DEFAULT_ADMIN_ROLE();
      expect(await sKrww.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await sKrww.hasRole(VAULT_MANAGER_ROLE, owner.address)).to.be.true;
      expect(await sKrww.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
      expect(await sKrww.hasRole(BLACKLIST_MANAGER_ROLE, owner.address)).to.be.true;
    });

    it("Should start with zero total supply and assets", async function () {
      expect(await sKrww.totalSupply()).to.equal(0);
      expect(await sKrww.totalAssets()).to.equal(0);
    });

    it("Should set correct cooldown period and reward rate", async function () {
      expect(await sKrww.COOLDOWN_PERIOD()).to.equal(COOLDOWN_PERIOD);
      expect(await sKrww.rewardRate()).to.equal(1000); // 10% APY
    });
  });

  describe("ERC4626 Deposit", function () {
    it("Should allow users to deposit KRWW tokens", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      
      // Approve sKRWW to spend KRWW
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      
      // Calculate expected shares (1:1 for first deposit)
      const expectedShares = await sKrww.previewDeposit(depositAmount);
      
      await expect(sKrww.connect(user1).deposit(depositAmount, user1.address))
        .to.emit(sKrww, "Deposit")
        .withArgs(user1.address, user1.address, depositAmount, expectedShares);

      expect(await sKrww.balanceOf(user1.address)).to.equal(expectedShares);
      expect(await sKrww.totalSupply()).to.equal(expectedShares);
      expect(await sKrww.totalAssets()).to.equal(depositAmount);
    });

    it("Should track deposit timestamp", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      
      const tx = await sKrww.connect(user1).deposit(depositAmount, user1.address);
      const receipt = await tx.wait();
      const blockTimestamp = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
      
      expect(await sKrww.getDepositTimestamp(user1.address)).to.equal(blockTimestamp);
    });

    it("Should revert deposit from blacklisted address", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      
      await sKrww.connect(blacklistManager).blacklist(user1.address);
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      
      await expect(sKrww.connect(user1).deposit(depositAmount, user1.address))
        .to.be.revertedWithCustomError(sKrww, "BlacklistedAccount");
    });
  });

  describe("ERC4626 Mint", function () {
    it("Should allow users to mint shares", async function () {
      const mintShares = ethers.parseUnits("1000", 2);
      
      // Calculate required assets
      const requiredAssets = await sKrww.previewMint(mintShares);
      
      await krww.connect(user1).approve(await sKrww.getAddress(), requiredAssets);
      
      await expect(sKrww.connect(user1).mint(mintShares, user1.address))
        .to.emit(sKrww, "Deposit")
        .withArgs(user1.address, user1.address, requiredAssets, mintShares);

      expect(await sKrww.balanceOf(user1.address)).to.equal(mintShares);
      expect(await sKrww.totalSupply()).to.equal(mintShares);
    });
  });

  describe("ERC4626 Withdraw", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      await sKrww.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should allow withdrawal after cooldown period", async function () {
      const withdrawAmount = ethers.parseUnits("500", 2);
      
      // Fast forward time by cooldown period
      await time.increase(COOLDOWN_PERIOD);
      
      const expectedShares = await sKrww.previewWithdraw(withdrawAmount);
      
      await expect(sKrww.connect(user1).withdraw(withdrawAmount, user1.address, user1.address))
        .to.emit(sKrww, "Withdraw")
        .withArgs(user1.address, user1.address, user1.address, withdrawAmount, expectedShares);

      expect(await sKrww.balanceOf(user1.address)).to.equal(ethers.parseUnits("500", 2));
      expect(await krww.balanceOf(user1.address)).to.equal(ethers.parseUnits("9500", 2)); // 10000 - 1000 + 500
    });

    it("Should revert withdrawal before cooldown period", async function () {
      const withdrawAmount = ethers.parseUnits("500", 2);
      
      await expect(sKrww.connect(user1).withdraw(withdrawAmount, user1.address, user1.address))
        .to.be.revertedWithCustomError(sKrww, "CooldownNotMet");
    });

    it("Should calculate cooldown remaining correctly", async function () {
      const halfCooldown = COOLDOWN_PERIOD / 2;
      
      // Fast forward half the cooldown period
      await time.increase(halfCooldown);
      
      const remaining = await sKrww.getCooldownRemaining(user1.address);
      expect(remaining).to.be.closeTo(halfCooldown, 5); // Allow 5 second tolerance
    });
  });

  describe("ERC4626 Redeem", function () {
    beforeEach(async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      await sKrww.connect(user1).deposit(depositAmount, user1.address);
    });

    it("Should allow redeem after cooldown period", async function () {
      const redeemShares = ethers.parseUnits("500", 2);
      
      // Fast forward time by cooldown period
      await time.increase(COOLDOWN_PERIOD);
      
      const expectedAssets = await sKrww.previewRedeem(redeemShares);
      
      await expect(sKrww.connect(user1).redeem(redeemShares, user1.address, user1.address))
        .to.emit(sKrww, "Withdraw")
        .withArgs(user1.address, user1.address, user1.address, expectedAssets, redeemShares);

      expect(await sKrww.balanceOf(user1.address)).to.equal(ethers.parseUnits("500", 2));
    });

    it("Should revert redeem before cooldown period", async function () {
      const redeemShares = ethers.parseUnits("500", 2);
      
      await expect(sKrww.connect(user1).redeem(redeemShares, user1.address, user1.address))
        .to.be.revertedWithCustomError(sKrww, "CooldownNotMet");
    });
  });

  describe("ERC4626 Preview Functions", function () {
    it("Should preview deposit correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      const previewShares = await sKrww.previewDeposit(depositAmount);
      
      // For first deposit, should be 1:1
      expect(previewShares).to.equal(depositAmount);
    });

    it("Should preview mint correctly", async function () {
      const mintShares = ethers.parseUnits("1000", 2);
      const previewAssets = await sKrww.previewMint(mintShares);
      
      // For first mint, should be 1:1
      expect(previewAssets).to.equal(mintShares);
    });
  });

  describe("Reward Distribution", function () {
    it("Should allow vault manager to distribute rewards", async function () {
      const rewardAmount = ethers.parseUnits("100", 2);
      
      await krww.connect(vaultManager).approve(await sKrww.getAddress(), rewardAmount);
      
      await expect(sKrww.connect(vaultManager).distributeRewards(rewardAmount))
        .to.emit(sKrww, "RewardsDistributed")
        .withArgs(rewardAmount);
      
      expect(await sKrww.totalAssets()).to.equal(rewardAmount);
    });

    it("Should not allow non-vault manager to distribute rewards", async function () {
      const rewardAmount = ethers.parseUnits("100", 2);
      
      await expect(sKrww.connect(user1).distributeRewards(rewardAmount))
        .to.be.revertedWithCustomError(sKrww, "AccessControlUnauthorizedAccount");
    });

    it("Should allow setting reward rate", async function () {
      const newRate = 1500; // 15%
      
      await expect(sKrww.connect(vaultManager).setRewardRate(newRate))
        .to.emit(sKrww, "RewardRateUpdated")
        .withArgs(1000, newRate);
      
      expect(await sKrww.rewardRate()).to.equal(newRate);
    });
  });

  describe("Blacklisting", function () {
    it("Should allow blacklist manager to blacklist address", async function () {
      await expect(sKrww.connect(blacklistManager).blacklist(user1.address))
        .to.emit(sKrww, "Blacklisted")
        .withArgs(user1.address);

      expect(await sKrww.isBlacklisted(user1.address)).to.be.true;
    });

    it("Should prevent transfers from blacklisted address", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      
      // Deposit first
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      await sKrww.connect(user1).deposit(depositAmount, user1.address);
      
      // Then blacklist
      await sKrww.connect(blacklistManager).blacklist(user1.address);
      
      await expect(sKrww.connect(user1).transfer(user2.address, ethers.parseUnits("100", 2)))
        .to.be.revertedWithCustomError(sKrww, "BlacklistedAccount");
    });
  });

  describe("Pausing", function () {
    it("Should allow pauser to pause the contract", async function () {
      await sKrww.connect(pauser).pause();
      expect(await sKrww.paused()).to.be.true;
    });

    it("Should prevent deposits when paused", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      
      await sKrww.connect(pauser).pause();
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      
      await expect(sKrww.connect(user1).deposit(depositAmount, user1.address))
        .to.be.revertedWithCustomError(sKrww, "EnforcedPause");
    });
  });

  describe("ERC4626 Max Functions", function () {
    it("Should return correct max deposit", async function () {
      const maxDeposit = await sKrww.maxDeposit(user1.address);
      expect(maxDeposit).to.equal(ethers.MaxUint256);
    });

    it("Should return correct max mint", async function () {
      const maxMint = await sKrww.maxMint(user1.address);
      expect(maxMint).to.equal(ethers.MaxUint256);
    });

    it("Should return zero max withdraw/redeem before cooldown", async function () {
      const depositAmount = ethers.parseUnits("1000", 2);
      await krww.connect(user1).approve(await sKrww.getAddress(), depositAmount);
      await sKrww.connect(user1).deposit(depositAmount, user1.address);
      
      // Before cooldown, should not be able to withdraw/redeem
      expect(await sKrww.maxWithdraw(user1.address)).to.equal(0);
      expect(await sKrww.maxRedeem(user1.address)).to.equal(0);
    });
  });
});