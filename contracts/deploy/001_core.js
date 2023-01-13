const hre = require("hardhat");

const addresses = require("../utils/addresses");
const {
  getAssetAddresses,
  getOracleAddresses,
  isMainnet,
  isFork,
} = require("../test/helpers.js");
const {
  log,
  deployWithConfirmation,
  withConfirmation,
} = require("../utils/deploy");
const {
  metapoolLPCRVPid,
  lusdMetapoolLPCRVPid,
} = require("../utils/constants");


const deployGovernor = async () => {
  const { guardianAddr } = await hre.getNamedAccounts();
  await deployWithConfirmation("Governor", [guardianAddr, 60]);

  const cGovernor = await ethers.getContract("Governor")

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [cGovernor.address],
  });

  await hre.network.provider.send("hardhat_setBalance", [
    cGovernor.address,
    ethers.utils.parseEther("1000000").toHexString(),
  ]);
}

/**
 * Deploy the core contracts (Vault and OETH).
 *
 */
const deployCore = async () => {
  const { deployerAddr, guardianAddr } = await hre.getNamedAccounts();
  const cGovernor = await ethers.getContract("Governor")
  const governorAddr = cGovernor.address

  const assetAddresses = await getAssetAddresses(deployments);
  log(`Using asset addresses: ${JSON.stringify(assetAddresses, null, 2)}`);

  // Signers
  const sGovernor = await ethers.provider.getSigner(governorAddr);
  const sDeployer = await ethers.provider.getSigner(deployerAddr);

  // Proxies
  await deployWithConfirmation("OETHProxy");
  await deployWithConfirmation("VaultProxy");

  // Main contracts
  const dOETH = await deployWithConfirmation("OETH");
  const dVault = await deployWithConfirmation("Vault");
  const dVaultCore = await deployWithConfirmation("VaultCore");
  const dVaultAdmin = await deployWithConfirmation("VaultAdmin");

  await deployWithConfirmation("Governor", [guardianAddr, 60]);

  // Get contract instances
  const cOETHProxy = await ethers.getContract("OETHProxy");
  const cVaultProxy = await ethers.getContract("VaultProxy");
  const cOETH = await ethers.getContractAt("OETH", cOETHProxy.address);
  const cVault = await ethers.getContractAt("Vault", cVaultProxy.address);

  await withConfirmation(
    cOETHProxy.connect(sDeployer)["initialize(address,address,bytes)"](
      dOETH.address,
      governorAddr,
      []
    )
  );
  log("Initialized OETHProxy");

  // Need to call the initializer on the Vault then upgraded it to the actual
  // VaultCore implementation
  await withConfirmation(
    cVaultProxy.connect(sDeployer)["initialize(address,address,bytes)"](
      dVault.address,
      governorAddr,
      []
    )
  );
  log("Initialized VaultProxy");

  await withConfirmation(
    cVault
      .connect(sGovernor)
      .initialize(cOETHProxy.address, assetAddresses.WETH)
  );
  log("Initialized Vault");

  await withConfirmation(
    cVaultProxy.connect(sGovernor).upgradeTo(dVaultCore.address)
  );
  log("Upgraded VaultCore implementation");

  await withConfirmation(
    cVault.connect(sGovernor).setAdminImpl(dVaultAdmin.address)
  );
  log("Initialized VaultAdmin implementation");

  // Initialize OETH
  await withConfirmation(
    cOETH
      .connect(sGovernor)
      .initialize("Origin Ether", "OETH", cVaultProxy.address)
  );

  log("Initialized OETH");
};

/**
 * Deploy Harvester
 */
const deployHarvester = async () => {
  const assetAddresses = await getAssetAddresses(deployments);
  const { deployerAddr } = await getNamedAccounts();
  const cGovernor = await ethers.getContract("Governor")
  // Signers
  const sDeployer = await ethers.provider.getSigner(deployerAddr);
  const sGovernor = await ethers.provider.getSigner(cGovernor.address);

  const cVaultProxy = await ethers.getContract("VaultProxy");

  const dHarvesterProxy = await deployWithConfirmation(
    "HarvesterProxy",
    [],
    "InitializeGovernedUpgradeabilityProxy"
  );
  const cHarvesterProxy = await ethers.getContract("HarvesterProxy");
  const dHarvester = await deployWithConfirmation("Harvester", [
    cVaultProxy.address,
    assetAddresses.WETH,
  ]);
  const cHarvester = await ethers.getContractAt(
    "Harvester",
    dHarvesterProxy.address
  );
  await withConfirmation(
    cHarvesterProxy.connect(sDeployer)["initialize(address,address,bytes)"](
      dHarvester.address,
      deployerAddr,
      []
    )
  );

  log("Initialized HarvesterProxy");

  await withConfirmation(
    cHarvester.connect(sDeployer).transferGovernance(cGovernor.address)
  );
  log(`Harvester transferGovernance(${cGovernor.address} called`);

  // On Mainnet the governance transfer gets executed separately, via the
  // multi-sig wallet. On other networks, this migration script can claim
  // governance by the governor.
  if (!isMainnet) {
    await withConfirmation(
      cHarvester
        .connect(sGovernor) // Claim governance with governor
        .claimGovernance()
    );
    log("Claimed governance for Harvester");

    await withConfirmation(
      cHarvester
        .connect(sGovernor)
        .setRewardsProceedsAddress(cVaultProxy.address)
    );
  }

  return dHarvesterProxy;
};

/**
 * Configure Vault by adding supported assets and Strategies.
 */
const configureVault = async (harvesterProxy) => {
  const assetAddresses = await getAssetAddresses(deployments);
  const { strategistAddr } = await getNamedAccounts();
  const cGovernor = await ethers.getContract("Governor")
  const governorAddr = cGovernor.address
  // Signers
  const sGovernor = await ethers.provider.getSigner(governorAddr);

  await ethers.getContractAt(
    "VaultInitializer",
    (
      await ethers.getContract("VaultProxy")
    ).address
  );
  const cVault = await ethers.getContractAt(
    "VaultAdmin",
    (
      await ethers.getContract("VaultProxy")
    ).address
  );
  // // Set up supported assets for Vault
  // await withConfirmation(
  //   cVault.connect(sGovernor).supportAsset(assetAddresses.DAI)
  // );
  // log("Added DAI asset to Vault");
  // await withConfirmation(
  //   cVault.connect(sGovernor).supportAsset(assetAddresses.USDT)
  // );
  // log("Added USDT asset to Vault");
  // await withConfirmation(
  //   cVault.connect(sGovernor).supportAsset(assetAddresses.USDC)
  // );
  // log("Added USDC asset to Vault");
  // Unpause deposits
  await withConfirmation(cVault.connect(sGovernor).unpauseCapital());
  log("Unpaused deposits on Vault");
  // Set Strategist address.
  await withConfirmation(
    cVault.connect(sGovernor).setStrategistAddr(strategistAddr)
  );
};

async function fundDeployer() {
  if (!isFork) return

  const { deployerAddr, governorAddr, guardianAddr } = await hre.getNamedAccounts();
  
  await hre.network.provider.send("hardhat_setBalance", [
    deployerAddr,
    ethers.utils.parseEther("1000000").toHexString(),
  ]);

  await hre.network.provider.send("hardhat_setBalance", [
    guardianAddr,
    ethers.utils.parseEther("1000000").toHexString(),
  ]);
  
  await hre.network.provider.send("hardhat_setBalance", [
    governorAddr,
    ethers.utils.parseEther("1000000").toHexString(),
  ]);
}

const main = async () => {
  console.log("Running 001_core deployment...");
  await fundDeployer();
  await deployGovernor();
  await deployCore();
  const harvesterProxy = await deployHarvester();
  await configureVault(harvesterProxy);
  console.log("001_core deploy done.");
  return true;
};

main.id = "001_core";
main.dependencies = ["mocks"];
// main.skip = () => isFork;

module.exports = main;
