const hre = require("hardhat");
const { parseEther } = require("ethers").utils;

const { expect } = require("chai");
const { oethFixture } = require('./_oeth-fixtures');

const {
  loadFixture,
  propose,
  proposeAndExecute,
  advanceTime,
} = require('./helpers')

describe.only('OETH', () => {
  it("Should mint OETH w/ ETH", async () => {
    const fixture = await loadFixture(oethFixture);
    const { vault, matt, oeth } = fixture

    const amount = parseEther("1.23")
    const oldSupply = await oeth.totalSupply();
    const oldBal = await oeth.connect(matt).balanceOf(matt.address)

    await vault.connect(matt)["mint()"]({
      value: amount
    })
    
    const newSupply = await oeth.totalSupply();
    expect(newSupply.sub(oldSupply)).to.approxEqual(amount)

    const newBal = await oeth.connect(matt).balanceOf(matt.address)
    expect(newBal.sub(oldBal)).to.approxEqual(amount)
  })
  it("Should mint OETH w/ WETH", async () => {
    const fixture = await loadFixture(oethFixture);
    const { vault, matt, oeth, weth } = fixture

    const amount = parseEther("1.23")
    const oldSupply = await oeth.totalSupply();
    const oldBal = await oeth.connect(matt).balanceOf(matt.address)
    const oldWethBal = await weth.connect(matt).balanceOf(matt.address)

    await vault.connect(matt)["mint(uint256)"](amount)
    
    const newSupply = await oeth.totalSupply();
    expect(newSupply.sub(oldSupply)).to.approxEqual(amount)

    const newBal = await oeth.connect(matt).balanceOf(matt.address)
    expect(newBal.sub(oldBal)).to.approxEqual(amount)

    const newWethBal = await weth.connect(matt).balanceOf(matt.address)
    expect(oldWethBal.sub(newWethBal)).to.approxEqual(amount)
  })

  it("Should redeem WETH for OETH", async () => {
    const fixture = await loadFixture(oethFixture);
    const { vault, josh, oeth, weth } = fixture

    const amount = parseEther("0.727")

    const oldSupply = await oeth.totalSupply();
    const oldBal = await oeth.connect(josh).balanceOf(josh.address)
    const oldWethBal = await weth.connect(josh).balanceOf(josh.address)

    await vault.connect(josh)["redeem(uint256)"](amount)
    
    const newSupply = await oeth.totalSupply();
    expect(oldSupply.sub(newSupply)).to.approxEqual(amount)

    const newBal = await oeth.connect(josh).balanceOf(josh.address)
    expect(oldBal.sub(newBal)).to.approxEqual(amount)

    const newWethBal = await weth.connect(josh).balanceOf(josh.address)
    expect(newWethBal.sub(oldWethBal)).to.approxEqual(amount)
  })
})