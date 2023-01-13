const hre = require("hardhat");
const { parseEther } = require("ethers").utils;

const { expect } = require("chai");
const { oethFixture } = require('./_oeth-fixtures');

const {
  loadFixture,
  forkOnlyDescribe,
  propose,
  proposeAndExecute,
  advanceTime,
} = require('./helpers')

forkOnlyDescribe('ForkTest: OETH', function () {
  this.timeout(0)

  describe("Mint & Redeem", async () => {
    it("Should mint OETH w/ ETH", async () => {
      const fixture = await loadFixture(oethFixture);
      const { vault, franck, oeth } = fixture
  
      const amount = parseEther("1.23")
      const oldSupply = await oeth.totalSupply();
      const oldBal = await oeth.connect(franck).balanceOf(franck.address)
  
      await vault.connect(franck)["mint()"]({
        value: amount
      })
      
      const newSupply = await oeth.totalSupply();
      expect(newSupply.sub(oldSupply)).to.approxEqual(amount)
  
      const newBal = await oeth.connect(franck).balanceOf(franck.address)
      expect(newBal.sub(oldBal)).to.approxEqual(amount)
    })
    it("Should mint OETH w/ WETH", async () => {
      const fixture = await loadFixture(oethFixture);
      const { vault, domen, oeth, weth } = fixture
  
      const amount = parseEther("1.23")
      const oldSupply = await oeth.totalSupply();
      const oldBal = await oeth.connect(domen).balanceOf(domen.address)
      const oldWethBal = await weth.connect(domen).balanceOf(domen.address)
  
      await vault.connect(domen)["mint(uint256)"](amount)
      
      const newSupply = await oeth.totalSupply();
      expect(newSupply.sub(oldSupply)).to.approxEqual(amount)
  
      const newBal = await oeth.connect(domen).balanceOf(domen.address)
      expect(newBal.sub(oldBal)).to.approxEqual(amount)
  
      const newWethBal = await weth.connect(domen).balanceOf(domen.address)
      expect(oldWethBal.sub(newWethBal)).to.approxEqual(amount)
    })
  
    it("Should redeem WETH for OETH", async () => {
      const fixture = await loadFixture(oethFixture);
      const { vault, matt, oeth, weth } = fixture
  
      const amount = parseEther("0.727")
  
      const oldSupply = await oeth.totalSupply();
      const oldBal = await oeth.connect(matt).balanceOf(matt.address)
      const oldWethBal = await weth.connect(matt).balanceOf(matt.address)
  
      await vault.connect(matt)["redeem(uint256)"](amount)
      
      const newSupply = await oeth.totalSupply();
      expect(oldSupply.sub(newSupply)).to.approxEqual(amount)
  
      const newBal = await oeth.connect(matt).balanceOf(matt.address)
      expect(oldBal.sub(newBal)).to.approxEqual(amount)
  
      const newWethBal = await weth.connect(matt).balanceOf(matt.address)
      expect(newWethBal.sub(oldWethBal)).to.approxEqual(amount)
    })
  })

  describe.only("Yeild", async () => {
    it("Ensure yield generation", async () => {
      const fixture = await loadFixture(oethFixture);
      const { vault, daniel, oeth, weth, morphoAave } = fixture
      
      const log = async () => {
        console.log('-------------------------------------------')
        // console.log("Vault value", (await vault.totalValue()).toString())
        console.log("Vault Balance ", (await vault.checkBalance()).toString())
        console.log("OETH Supply   ", (await oeth.totalSupply()).toString())
        console.log("Non-rebase sup", (await oeth.nonRebasingSupply()).toString())
        console.log("Strat bal     ", (await morphoAave.checkBalance(weth.address)).toString());
        console.log("Vault WETH Bal", (await weth.connect(daniel).balanceOf(vault.address)).toString());
        console.log("Buffer        ", (await vault.vaultBuffer()).toString());
        console.log('-------------------------------------------')
      }

      await log()

      const amount = parseEther("100")

      // Mint
      await vault.connect(daniel)["mint()"]({
        value: amount
      })
      // await vault.connect(daniel).allocate()
      // await vault.connect(daniel).rebase()

      const balance = await oeth.connect(daniel).balanceOf(daniel.address)
      console.log("Balance after mint", balance.toString())


      await log()
      // Advance time by 30d
      await advanceTime(86400 * 30);

      // Rebase
      await vault.connect(daniel).rebase()

      await log()
      // // Advance time again
      // await advanceTime(172800);
      
      const balance2 = await oeth.connect(daniel).balanceOf(daniel.address)
      console.log("Balance after rebase", balance2.toString())

      await log()
    })
  })
})