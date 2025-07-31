const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying sKRWW contract with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // First deploy KRWW if not already deployed
  console.log("\n=== Deploying KRWW Token ===");
  const KRWW = await hre.ethers.getContractFactory("KRWW");
  const krww = await KRWW.deploy(deployer.address);
  await krww.waitForDeployment();
  const krwwAddress = await krww.getAddress();
  console.log("KRWW deployed to:", krwwAddress);

  // Deploy sKRWW vault contract (ERC4626)
  console.log("\n=== Deploying sKRWW Vault Token ===");
  const sKRWW = await hre.ethers.getContractFactory("sKRWW");
  const sKrww = await sKRWW.deploy(deployer.address, krwwAddress);
  await sKrww.waitForDeployment();
  const sKrwwAddress = await sKrww.getAddress();
  console.log("sKRWW deployed to:", sKrwwAddress);

  // Verify deployment
  console.log("\n=== Verification ===");
  console.log("sKRWW Token name:", await sKrww.name());
  console.log("sKRWW Token symbol:", await sKrww.symbol());
  console.log("sKRWW Token decimals:", await sKrww.decimals());
  console.log("Underlying asset (KRWW):", await sKrww.asset());
  console.log("Total assets:", (await sKrww.totalAssets()).toString());
  console.log("Cooldown period:", (await sKrww.COOLDOWN_PERIOD()).toString(), "seconds");
  console.log("Reward rate:", (await sKrww.rewardRate()).toString(), "basis points");

  // Check roles
  const DEFAULT_ADMIN_ROLE = await sKrww.DEFAULT_ADMIN_ROLE();
  const VAULT_MANAGER_ROLE = await sKrww.VAULT_MANAGER_ROLE();
  const PAUSER_ROLE = await sKrww.PAUSER_ROLE();
  const BLACKLIST_MANAGER_ROLE = await sKrww.BLACKLIST_MANAGER_ROLE();

  console.log("\n=== Role Verification ===");
  console.log("Deployer has DEFAULT_ADMIN_ROLE:", await sKrww.hasRole(DEFAULT_ADMIN_ROLE, deployer.address));
  console.log("Deployer has VAULT_MANAGER_ROLE:", await sKrww.hasRole(VAULT_MANAGER_ROLE, deployer.address));
  console.log("Deployer has PAUSER_ROLE:", await sKrww.hasRole(PAUSER_ROLE, deployer.address));
  console.log("Deployer has BLACKLIST_MANAGER_ROLE:", await sKrww.hasRole(BLACKLIST_MANAGER_ROLE, deployer.address));

  return {
    krww: krwwAddress,
    sKrww: sKrwwAddress,
    deployer: deployer.address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });