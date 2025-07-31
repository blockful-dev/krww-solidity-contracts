const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WONDER", function () {
  let WONDER;
  let wonder;
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
    WONDER = await ethers.getContractFactory("WONDER");
    [owner, minter, pauser, blacklistManager, user1, user2, blacklistedUser] = await ethers.getSigners();

    wonder = await WONDER.deploy(owner.address);

    // Grant roles to different accounts
    await wonder.connect(owner).grantRole(MINTER_ROLE, minter.address);
    await wonder.connect(owner).grantRole(PAUSER_ROLE, pauser.address);
    await wonder.connect(owner).grantRole(BLACKLIST_MANAGER_ROLE, blacklistManager.address);
  });

  describe("Deployment", function () {
    it("Should set the right name, symbol and decimals", async function () {
      expect(await wonder.name()).to.equal(" WONDER");
      expect(await wonder.symbol()).to.equal("WONDER");
      expect(await wonder.decimals()).to.equal(18);
    });

    it("Should grant all roles to the owner", async function () {
      const DEFAULT_ADMIN_ROLE = await wonder.DEFAULT_ADMIN_ROLE();
      expect(await wonder.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
      expect(await wonder.hasRole(MINTER_ROLE, owner.address)).to.be.true;
      expect(await wonder.hasRole(PAUSER_ROLE, owner.address)).to.be.true;
      expect(await wonder.hasRole(BLACKLIST_MANAGER_ROLE, owner.address)).to.be.true;
    });

    it("Should start with zero total supply", async function () {
      expect(await wonder.totalSupply()).to.equal(0);
    });

    it("Should revert if deployed with zero address", async function () {
      await expect(WONDER.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(wonder, "ZeroAddress");
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const amount = ethers.parseEther("1000");

      await expect(wonder.connect(minter).mint(user1.address, amount))
        .to.emit(wonder, "Mint")
        .withArgs(user1.address, amount);

      expect(await wonder.balanceOf(user1.address)).to.equal(amount);
      expect(await wonder.totalSupply()).to.equal(amount);
    });

    it("Should not allow non-minter to mint tokens", async function () {
      const amount = ethers.parseEther("1000");

      await expect(wonder.connect(user1).mint(user2.address, amount))
        .to.be.revertedWithCustomError(wonder, "AccessControlUnauthorizedAccount");
    });

    it("Should revert minting to zero address", async function () {
      const amount = ethers.parseEther("1000");

      await expect(wonder.connect(minter).mint(ethers.ZeroAddress, amount))
        .to.be.revertedWithCustomError(wonder, "ZeroAddress");
    });

    it("Should revert minting zero amount", async function () {
      await expect(wonder.connect(minter).mint(user1.address, 0))
        .to.be.revertedWithCustomError(wonder, "ZeroAmount");
    });

    it("Should revert minting to blacklisted address", async function () {
      const amount = ethers.parseEther("1000");

      await wonder.connect(blacklistManager).blacklist(user1.address);

      await expect(wonder.connect(minter).mint(user1.address, amount))
        .to.be.revertedWithCustomError(wonder, "BlacklistedAccount");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await wonder.connect(minter).mint(user1.address, amount);
      await wonder.connect(minter).mint(user2.address, amount);
    });

    it("Should allow users to burn their tokens", async function () {
      const burnAmount = ethers.parseEther("500");

      await expect(wonder.connect(user1).burn(burnAmount))
        .to.emit(wonder, "Burn")
        .withArgs(user1.address, burnAmount);

      expect(await wonder.balanceOf(user1.address)).to.equal(ethers.parseEther("500"));
    });

    it("Should allow burning from approved address", async function () {
      const burnAmount = ethers.parseEther("300");

      await wonder.connect(user1).approve(user2.address, burnAmount);

      await expect(wonder.connect(user2).burnFrom(user1.address, burnAmount))
        .to.emit(wonder, "Burn")
        .withArgs(user1.address, burnAmount);

      expect(await wonder.balanceOf(user1.address)).to.equal(ethers.parseEther("700"));
    });

    it("Should revert burning zero amount", async function () {
      await expect(wonder.connect(user1).burn(0))
        .to.be.revertedWithCustomError(wonder, "ZeroAmount");
    });

    it("Should revert burning from blacklisted address", async function () {
      await wonder.connect(blacklistManager).blacklist(user1.address);

      await expect(wonder.connect(user1).burn(ethers.parseEther("100")))
        .to.be.revertedWithCustomError(wonder, "BlacklistedAccount");
    });
  });

  describe("Blacklisting", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await wonder.connect(minter).mint(user1.address, amount);
      await wonder.connect(minter).mint(user2.address, amount);
    });

    it("Should allow blacklist manager to blacklist address", async function () {
      await expect(wonder.connect(blacklistManager).blacklist(blacklistedUser.address))
        .to.emit(wonder, "Blacklisted")
        .withArgs(blacklistedUser.address);

      expect(await wonder.isBlacklisted(blacklistedUser.address)).to.be.true;
    });

    it("Should allow blacklist manager to unblacklist address", async function () {
      await wonder.connect(blacklistManager).blacklist(blacklistedUser.address);

      await expect(wonder.connect(blacklistManager).unBlacklist(blacklistedUser.address))
        .to.emit(wonder, "UnBlacklisted")
        .withArgs(blacklistedUser.address);

      expect(await wonder.isBlacklisted(blacklistedUser.address)).to.be.false;
    });

    it("Should prevent transfers from blacklisted address", async function () {
      await wonder.connect(blacklistManager).blacklist(user1.address);

      await expect(wonder.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(wonder, "BlacklistedAccount");
    });

    it("Should prevent transfers to blacklisted address", async function () {
      await wonder.connect(blacklistManager).blacklist(user2.address);

      await expect(wonder.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(wonder, "BlacklistedAccount");
    });

    it("Should not allow non-blacklist manager to blacklist", async function () {
      await expect(wonder.connect(user1).blacklist(user2.address))
        .to.be.revertedWithCustomError(wonder, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pausing", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await wonder.connect(minter).mint(user1.address, amount);
      await wonder.connect(minter).mint(user2.address, amount);
    });

    it("Should allow pauser to pause the contract", async function () {
      await wonder.connect(pauser).pause();
      expect(await wonder.paused()).to.be.true;
    });

    it("Should allow pauser to unpause the contract", async function () {
      await wonder.connect(pauser).pause();
      await wonder.connect(pauser).unpause();
      expect(await wonder.paused()).to.be.false;
    });

    it("Should prevent transfers when paused", async function () {
      await wonder.connect(pauser).pause();

      await expect(wonder.connect(user1).transfer(user2.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(wonder, "EnforcedPause");
    });

    it("Should prevent minting when paused", async function () {
      await wonder.connect(pauser).pause();

      await expect(wonder.connect(minter).mint(user1.address, ethers.parseEther("100")))
        .to.be.revertedWithCustomError(wonder, "EnforcedPause");
    });

    it("Should not allow non-pauser to pause", async function () {
      await expect(wonder.connect(user1).pause())
        .to.be.revertedWithCustomError(wonder, "AccessControlUnauthorizedAccount");
    });
  });

  describe("ERC20 Permit", function () {
    it("Should have correct domain separator", async function () {
      const domain = await wonder.DOMAIN_SEPARATOR();
      expect(domain).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Access Control", function () {
    it("Should support AccessControl interface", async function () {
      const interfaceId = "0x7965db0b"; // AccessControl interface ID
      expect(await wonder.supportsInterface(interfaceId)).to.be.true;
    });
  });

  describe("Token Transfer", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await wonder.connect(minter).mint(user1.address, amount);
    });

    it("Should transfer tokens between accounts", async function () {
      await wonder.connect(user1).transfer(user2.address, ethers.parseEther("50"));
      const user2Balance = await wonder.balanceOf(user2.address);
      expect(user2Balance).to.equal(ethers.parseEther("50"));

      const user1Balance = await wonder.balanceOf(user1.address);
      expect(user1Balance).to.equal(ethers.parseEther("950"));
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      await expect(
        wonder.connect(user2).transfer(user1.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(wonder, "ERC20InsufficientBalance");
    });
  });

  describe("Allowances", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await wonder.connect(minter).mint(user1.address, amount);
    });

    it("Should approve and transfer from", async function () {
      await wonder.connect(user1).approve(user2.address, ethers.parseEther("100"));
      expect(await wonder.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("100"));

      await wonder.connect(user2).transferFrom(user1.address, user2.address, ethers.parseEther("50"));
      expect(await wonder.balanceOf(user2.address)).to.equal(ethers.parseEther("50"));
      expect(await wonder.allowance(user1.address, user2.address)).to.equal(ethers.parseEther("50"));
    });

    it("Should fail transferFrom without allowance", async function () {
      await expect(
        wonder.connect(user2).transferFrom(user1.address, user2.address, ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(wonder, "ERC20InsufficientAllowance");
    });
  });
});