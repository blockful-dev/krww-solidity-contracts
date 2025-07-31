const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying sWONDER contract with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // First deploy WONDER if not already deployed
  console.log("\n=== Deploying WONDER Token ===");
  const WONDER = await hre.ethers.getContractFactory("WONDER");
  const wonder = await WONDER.deploy(deployer.address);
  await wonder.waitForDeployment();
  const wonderAddress = await wonder.getAddress();
  console.log("WONDER deployed to:", wonderAddress);

  // Deploy sWONDER vault contract (ERC4626)
  console.log("\n=== Deploying sWONDER Vault Token ===");
  const sWONDER = await hre.ethers.getContractFactory("sWONDER");
  const sWonder = await sWONDER.deploy(deployer.address, wonderAddress);
  await sWonder.waitForDeployment();
  const sWonderAddress = await sWonder.getAddress();
  console.log("sWONDER deployed to:", sWonderAddress);

  // Verify deployment
  console.log("\n=== Verification ===");
  console.log("sWONDER Token name:", await sWonder.name());
  console.log("sWONDER Token symbol:", await sWonder.symbol());
  console.log("sWONDER Token decimals:", await sWonder.decimals());
  console.log("Underlying asset (WONDER):", await sWonder.asset());
  console.log("Total assets:", (await sWonder.totalAssets()).toString());
  console.log("Cooldown period:", (await sWonder.COOLDOWN_PERIOD()).toString(), "seconds");
  console.log("Reward rate:", (await sWonder.rewardRate()).toString(), "basis points");

  // Check roles
  const DEFAULT_ADMIN_ROLE = await sWonder.DEFAULT_ADMIN_ROLE();
  const VAULT_MANAGER_ROLE = await sWonder.VAULT_MANAGER_ROLE();
  const PAUSER_ROLE = await sWonder.PAUSER_ROLE();
  const BLACKLIST_MANAGER_ROLE = await sWonder.BLACKLIST_MANAGER_ROLE();

  console.log("\n=== Role Verification ===");
  console.log("Deployer has DEFAULT_ADMIN_ROLE:", await sWonder.hasRole(DEFAULT_ADMIN_ROLE, deployer.address));
  console.log("Deployer has VAULT_MANAGER_ROLE:", await sWonder.hasRole(VAULT_MANAGER_ROLE, deployer.address));
  console.log("Deployer has PAUSER_ROLE:", await sWonder.hasRole(PAUSER_ROLE, deployer.address));
  console.log("Deployer has BLACKLIST_MANAGER_ROLE:", await sWonder.hasRole(BLACKLIST_MANAGER_ROLE, deployer.address));

  return {
    wonder: wonderAddress,
    sWonder: sWonderAddress,
    deployer: deployer.address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });