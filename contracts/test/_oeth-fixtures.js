
const hre = require("hardhat");

const { ethers } = hre;

const addresses = require("../utils/addresses");
const { fundAccounts } = require("../utils/funding");
const {
  isFork,
  isForkWithLocalNode,
} = require("./helpers");

const erc20Abi = require("./abi/erc20.json");

async function oethFixture() {
  await deployments.fixture(undefined, {
    keepExistingDeployments: Boolean(isForkWithLocalNode),
  });

  // const { governorAddr } = await getNamedAccounts();

  const oethProxy = await ethers.getContract("OETHProxy");
  const vaultProxy = await ethers.getContract("VaultProxy");
  
  const oeth = await ethers.getContractAt("OUSD", oethProxy.address);
  const vault = await ethers.getContractAt("IOETHVault", vaultProxy.address);
  const governorContract = await ethers.getContract("Governor");

  const signers = await hre.ethers.getSigners();
  let governor = signers[1];
  const strategist = signers[0];
  const adjuster = signers[0];

  const [matt, josh, anna, domen, daniel, franck] = signers.slice(4);

  let weth

  const morphoAaveProxy = await ethers.getContract("MorphoAaveStrategyProxy")
  const morphoAave = await ethers.getContractAt("MorphoAaveStrategy", morphoAaveProxy.address)

  if (isFork) {
    weth = await ethers.getContractAt("MockWETH", addresses.mainnet.WETH)

    for (const user of [matt, josh, anna, domen, franck, daniel]) {
      // Some ETH
      await hre.network.provider.send("hardhat_setBalance", [
        user.address,
        ethers.utils.parseEther("1000000").toHexString(),
      ]);

      // Get some WETH
      await weth.connect(user).deposit({
        value: ethers.utils.parseEther("1000")
      })
      await weth.connect(user).approve(vault.address, ethers.utils.parseEther("999999999999999999999"))
    }

    for (const user of [matt, josh, anna]) {
      // Mint some OETH
      const value = ethers.utils.parseEther("1")
      await vault.connect(user)["mint()"]({
        value
      })
      console.log('-------------------------------------------')
      // console.log("Vault value", (await vault.totalValue()).toString())
      console.log("Vault Balance ", (await vault.checkBalance()).toString())
      console.log("OETH Supply   ", (await oeth.totalSupply()).toString())
      console.log("Vault WETH Bal", (await weth.connect(daniel).balanceOf(vault.address)).toString());
      console.log("Matt Bal      ", (await oeth.connect(matt).balanceOf(matt.address)).toString());
      console.log("Josh Bal      ", (await oeth.connect(josh).balanceOf(josh.address)).toString());
      console.log("Anna Bal      ", (await oeth.connect(anna).balanceOf(anna.address)).toString());
      console.log("Matt Bal      ", (await oeth.connect(matt).creditsBalanceOf(matt.address)).toString());
      console.log("Josh Bal      ", (await oeth.connect(josh).creditsBalanceOf(josh.address)).toString());
      console.log("Anna Bal      ", (await oeth.connect(anna).creditsBalanceOf(anna.address)).toString());
      console.log('-------------------------------------------')
  
    }

    // await vault.connect(daniel).rebase()
  } else {
    weth = await ethers.getContract("MockWETH")

    for (const user of [matt, josh, anna]) {
      // Mint OETH for some users
      const value = ethers.utils.parseEther("3.5")
      await vault.connect(user)["mint()"]({
        value
      })

      // Mint WETH
      await weth.connect(user).mint(value)
      await weth.connect(user).approve(vault.address, ethers.utils.parseEther("999999999999999999999"))
    }
  }

  return {
    // Accounts
    matt,
    josh,
    anna,
    governor,
    strategist,
    adjuster,
    domen,
    daniel,
    franck,

    // Contracts
    oeth,
    weth,
    vault,
    morphoAave,
    governorContract
  }
}


module.exports = {
  oethFixture,
};
