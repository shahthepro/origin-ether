// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IOETHVault {
    function mint() external payable;
    function mint(uint256 _amount) external;
    function redeem(uint256 _amount) external;
    function redeemAll() external;
    function unpauseCapital() external;
    function strategistAddr() external view returns (address);
    function totalValue() external view returns (uint256);
    function checkBalance() external view returns (uint256);
    function vaultBuffer() external view returns (uint256);
    function rebase() external;
    function allocate() external;

    function defaultStrategy()
        external
        view
        returns (address);
}
