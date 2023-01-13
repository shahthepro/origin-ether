// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

import "./MintableERC20.sol";
import { IWETH9 } from "../interfaces/IWETH9.sol";

contract MockWETH is MintableERC20, IWETH9 {
    constructor() ERC20("WETH", "WETH") {}

    function deposit() public payable override {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint wad) public override {
        _burn(msg.sender, wad);
        msg.sender.call{value:wad}("");
    }
}
