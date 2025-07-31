const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying KRWW contract with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const KRWW = await hre.ethers.getContractFactory("KRWW");

  // Deploy with deployer as default admin
  const krww = await KRWW.deploy(deployer.address);

  await krww.waitForDeployment();

  const contractAddress = await krww.getAddress();
  console.log("KRWW deployed to:", contractAddress);

  // Verify deployment by checking token details
  console.log("Token name:", await krww.name());
  console.log("Token symbol:", await krww.symbol());
  console.log("Token decimals:", await krww.decimals());
  console.log("Total supply:", (await krww.totalSupply()).toString());

  // Check roles
  const DEFAULT_ADMIN_ROLE = await krww.DEFAULT_ADMIN_ROLE();
  const MINTER_ROLE = await krww.MINTER_ROLE();
  const PAUSER_ROLE = await krww.PAUSER_ROLE();
  const BLACKLIST_MANAGER_ROLE = await krww.BLACKLIST_MANAGER_ROLE();

  console.log("Deployer has DEFAULT_ADMIN_ROLE:", await krww.hasRole(DEFAULT_ADMIN_ROLE, deployer.address));
  console.log("Deployer has MINTER_ROLE:", await krww.hasRole(MINTER_ROLE, deployer.address));
  console.log("Deployer has PAUSER_ROLE:", await krww.hasRole(PAUSER_ROLE, deployer.address));
  console.log("Deployer has BLACKLIST_MANAGER_ROLE:", await krww.hasRole(BLACKLIST_MANAGER_ROLE, deployer.address));

  return {
    krww: contractAddress,
    deployer: deployer.address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });