// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IOETHStrategy {
    function mint() external payable;
    function redeem(uint256 _amount) external;
    function unpauseCapital() external;
    function strategistAddr() external view returns (address);
}
