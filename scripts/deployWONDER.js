const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying WONDER contract with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const WONDER = await hre.ethers.getContractFactory("WONDER");
  
  // Deploy with deployer as default admin
  const wonder = await WONDER.deploy(deployer.address);

  await wonder.waitForDeployment();

  const contractAddress = await wonder.getAddress();
  console.log("WONDER deployed to:", contractAddress);

  // Verify deployment by checking token details
  console.log("Token name:", await wonder.name());
  console.log("Token symbol:", await wonder.symbol());
  console.log("Token decimals:", await wonder.decimals());
  console.log("Total supply:", (await wonder.totalSupply()).toString());

  // Check roles
  const DEFAULT_ADMIN_ROLE = await wonder.DEFAULT_ADMIN_ROLE();
  const MINTER_ROLE = await wonder.MINTER_ROLE();
  const PAUSER_ROLE = await wonder.PAUSER_ROLE();
  const BLACKLIST_MANAGER_ROLE = await wonder.BLACKLIST_MANAGER_ROLE();

  console.log("Deployer has DEFAULT_ADMIN_ROLE:", await wonder.hasRole(DEFAULT_ADMIN_ROLE, deployer.address));
  console.log("Deployer has MINTER_ROLE:", await wonder.hasRole(MINTER_ROLE, deployer.address));
  console.log("Deployer has PAUSER_ROLE:", await wonder.hasRole(PAUSER_ROLE, deployer.address));
  console.log("Deployer has BLACKLIST_MANAGER_ROLE:", await wonder.hasRole(BLACKLIST_MANAGER_ROLE, deployer.address));

  return {
    wonder: contractAddress,
    deployer: deployer.address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });