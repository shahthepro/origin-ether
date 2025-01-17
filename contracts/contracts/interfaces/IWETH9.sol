// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

interface IWETH9 {
    function deposit() external payable;
    function withdraw(uint amount) external;
}
