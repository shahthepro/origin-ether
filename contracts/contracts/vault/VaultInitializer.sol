// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

/**
 * @title OETH VaultInitializer Contract
 * @notice The Vault contract initializes the vault.
 * @author Origin Protocol Inc
 */

import "./VaultStorage.sol";

contract VaultInitializer is VaultStorage {
    function initialize(address _oeth, address _weth)
        external
        onlyGovernor
        initializer
    {
        require(_oeth != address(0), "oETH address is zero");

        oETH = OETH(_oeth);
        wETH = IERC20(_weth);

        rebasePaused = false;
        capitalPaused = true;

        // Initial redeem fee of 0 basis points
        redeemFeeBps = 0;
        // Initial Vault buffer of 0%
        vaultBuffer = 0;
        // Initial allocate threshold of 25 ETH
        autoAllocateThreshold = 30 ether;
        // Threshold for rebasing
        rebaseThreshold = 10 ether;
        // Initialize all strategies
        allStrategies = new address[](0);
    }
}
