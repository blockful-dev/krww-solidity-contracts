const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KRWW", function () {
  let KRWW;
  let krww;
  let owner;
  let minter;
  let pauser;
  let blacklistManager;
  let user1;
  let user2;
  let blacklistedUser;

  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
  const BLACKLIST_MANAGER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("BLACKLIST_MANAGER_ROLE"));

  beforeEach(async function () {
    KRWW = await ethers.getContractFactory("KRWW");
    [owner, minter, pauser, blacklistManager, user1, user2, blacklistedUser] = await ethers.getSigners();

    krww = await KRWW.deploy(owner.address);

    // Grant roles to different accounts
    await krww.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await krww.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await krww.connect(owner).grantRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address);
  });

  describe("Deployment", function () {
    it("Should set the right name, symbol and decimals", async function () {
      expect(await krww.name()).to.equal("Korean Won Wonder");
      expect(await krww.symbol()).to.equal("KRWW");
      expect(await krww.decimals()).to.equal(2);
    });

    it("Should grant all roles to the owner", async function () {
      const DEFAULT_ADMIN_ROLE = await krww.DEFAULT_ADMIN_ROLE();
      expect(await krww.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await krww.hasRole(MINTER_ROLE, owner.address)).to.be.true;
      expect(await krww.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
      expect(await krww.hasRole(BLACKLIST_MANAGER_ROLE, owner.address)).to.be.true;
    });

    it("Should start with zero total supply", async function () {
      expect(await krww.totalSupply()).to.equal(0);
    });

    it("Should revert if deployed with zero address", async function () {
      await expect(KRWW.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(krww, "ZeroAddress");
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const amount = ethers.parseUnits("1000", 2);

      await expect(krww.connect(minter).mint(user1.address, amount))
        .to.emit(krww, "Mint")
        .withArgs(user1.address, amount);

      expect(await krww.balanceOf(user1.address)).to.equal(amount);
      expect(await krww.totalSupply()).to.equal(amount);
    });

    it("Should not allow non-minter to mint tokens", async function () {
      const amount = ethers.parseUnits("1000", 2);

      await expect(krww.connect(user1).mint(user2.address, amount))
        .to.be.revertedWithCustomError(krww, "AccessControlUnauthorizedAccount");
    });

    it("Should revert minting to zero address", async function () {
      const amount = ethers.parseUnits("1000", 2);

      await expect(krww.connect(minter).mint(ethers.ZeroAddress, amount))
        .to.be.revertedWithCustomError(krww, "ZeroAddress");
    });

    it("Should revert minting zero amount", async function () {
      await expect(krww.connect(minter).mint(user1.address, 0))
        .to.be.revertedWithCustomError(krww, "ZeroAmount");
    });

    it("Should revert minting to blacklisted address", async function () {
      const amount = ethers.parseUnits("1000", 2);

      await krww.connect(blacklistManager).blacklist(user1.address);

      await expect(krww.connect(minter).mint(user1.address, amount))
        .to.be.revertedWithCustomError(krww, "BlacklistedAccount");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 2);
      await krww.connect(minter).mint(user1.address, amount);
      await krww.connect(minter).mint(user2.address, amount);
    });

    it("Should allow users to burn their tokens", async function () {
      const burnAmount = ethers.parseUnits("500", 2);

      await expect(krww.connect(user1).burn(burnAmount))
        .to.emit(krww, "Burn")
        .withArgs(user1.address, burnAmount);

      expect(await krww.balanceOf(user1.address)).to.equal(ethers.parseUnits("500", 2));
    });

    it("Should allow burning from approved address", async function () {
      const burnAmount = ethers.parseUnits("300", 2);

      await krww.connect(user1).approve(user2.address, burnAmount);

      await expect(krww.connect(user2).burnFrom(user1.address, burnAmount))
        .to.emit(krww, "Burn")
        .withArgs(user1.address, burnAmount);

      expect(await krww.balanceOf(user1.address)).to.equal(ethers.parseUnits("700", 2));
    });

    it("Should revert burning zero amount", async function () {
      await expect(krww.connect(user1).burn(0))
        .to.be.revertedWithCustomError(krww, "ZeroAmount");
    });

    it("Should revert burning from blacklisted address", async function () {
      await krww.connect(blacklistManager).blacklist(user1.address);

      await expect(krww.connect(user1).burn(ethers.parseUnits("100", 2)))
        .to.be.revertedWithCustomError(krww, "BlacklistedAccount");
    });
  });

  describe("Blacklisting", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 2);
      await krww.connect(minter).mint(user1.address, amount);
      await krww.connect(minter).mint(user2.address, amount);
    });

    it("Should allow blacklist manager to blacklist address", async function () {
      await expect(krww.connect(blacklistManager).blacklist(blacklistedUser.address))
        .to.emit(krww, "Blacklisted")
        .withArgs(blacklistedUser.address);

      expect(await krww.isBlacklisted(blacklistedUser.address)).to.be.true;
    });

    it("Should allow blacklist manager to unblacklist address", async function () {
      await krww.connect(blacklistManager).blacklist(blacklistedUser.address);

      await expect(krww.connect(blacklistManager).unBlacklist(blacklistedUser.address))
        .to.emit(krww, "UnBlacklisted")
        .withArgs(blacklistedUser.address);

      expect(await krww.isBlacklisted(blacklistedUser.address)).to.be.false;
    });

    it("Should prevent transfers from blacklisted address", async function () {
      await krww.connect(blacklistManager).blacklist(user1.address);

      await expect(krww.connect(user1).transfer(user2.address, ethers.parseUnits("100", 2)))
        .to.be.revertedWithCustomError(krww, "BlacklistedAccount");
    });

    it("Should prevent transfers to blacklisted address", async function () {
      await krww.connect(blacklistManager).blacklist(user2.address);

      await expect(krww.connect(user1).transfer(user2.address, ethers.parseUnits("100", 2)))
        .to.be.revertedWithCustomError(krww, "BlacklistedAccount");
    });

    it("Should not allow non-blacklist manager to blacklist", async function () {
      await expect(krww.connect(user1).blacklist(user2.address))
        .to.be.revertedWithCustomError(krww, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pausing", function () {
    beforeEach(async function () {
      const amount = ethers.parseUnits("1000", 2);
      await krww.connect(minter).mint(user1.address, amount);
      await krww.connect(minter).mint(user2.address, amount);
    });

    it("Should allow pauser to pause the contract", async function () {
      await krww.connect(pauser).pause();
      expect(await krww.paused()).to.be.true;
    });

    it("Should allow pauser to unpause the contract", async function () {
      await krww.connect(pauser).pause();
      await krww.connect(pauser).unpause();
      expect(await krww.paused()).to.be.false;
    });

    it("Should prevent transfers when paused", async function () {
      await krww.connect(pauser).pause();

      await expect(krww.connect(user1).transfer(user2.address, ethers.parseUnits("100", 2)))
        .to.be.revertedWithCustomError(krww, "EnforcedPause");
    });

    it("Should prevent minting when paused", async function () {
      await krww.connect(pauser).pause();

      await expect(krww.connect(minter).mint(user1.address, ethers.parseUnits("100", 2)))
        .to.be.revertedWithCustomError(krww, "EnforcedPause");
    });

    it("Should not allow non-pauser to pause", async function () {
      await expect(krww.connect(user1).pause())
        .to.be.revertedWithCustomError(krww, "AccessControlUnauthorizedAccount");
    });
  });

  describe("ERC20 Permit", function () {
    it("Should have correct domain separator", async function () {
      const domain = await krww.DOMAIN_SEPARATOR();
      expect(domain).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Access Control", function () {
    it("Should support AccessControl interface", async function () {
      const interfaceId = "0x7965db0b"; // AccessControl interface ID
      expect(await krww.supportsInterface(interfaceId)).to.be.true;
    });
  });
});