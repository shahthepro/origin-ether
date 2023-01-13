// SPDX-License-Identifier: agpl-3.0
pragma solidity ^0.8.0;

/**
 * @title OETH Vault Contract
 * @notice The Vault contract stores assets. On a deposit, OETH will be minted
           and sent to the depositor. On a withdrawal, OETH will be burned and
           assets will be sent to the withdrawer. The Vault accepts deposits of
           interest from yield bearing strategies which will modify the supply
           of OETH.
 * @author Origin Protocol Inc
 */

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import { StableMath } from "../utils/StableMath.sol";
import { IOracle } from "../interfaces/IOracle.sol";
import { IWETH9 } from "../interfaces/IWETH9.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IBuyback } from "../interfaces/IBuyback.sol";
import "./VaultStorage.sol";

contract VaultCore is VaultStorage {
    using SafeERC20 for IERC20;
    // using SafeERC20 for IWETH9;
    using StableMath for uint256;
    using SafeMath for uint256;
    // max signed int
    uint256 constant MAX_INT = 2**255 - 1;
    // max un-signed int
    uint256 constant MAX_UINT =
        0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /**
     * @dev Verifies that the rebasing is not paused.
     */
    modifier whenNotRebasePaused() {
        require(!rebasePaused, "Rebasing paused");
        _;
    }

    /**
     * @dev Verifies that the deposits are not paused.
     */
    modifier whenNotCapitalPaused() {
        require(!capitalPaused, "Capital paused");
        _;
    }

    /**
     * @dev Deposit a supported asset and mint OETH.
     */
    function _mint(uint256 _amount) internal {
        require(_amount > 0, "Amount must be greater than 0");

        emit Mint(msg.sender, _amount);

        // Rebase must happen before any transfers occur.
        if (_amount >= rebaseThreshold && !rebasePaused) {
            _rebase();
        }

        // Mint matching OETH
        oETH.mint(msg.sender, _amount);

        if (_amount >= autoAllocateThreshold) {
            _allocate();
        }
    }

    /**
     * @dev Deposit ETH and mint OETH.
     */
    function mint() external payable whenNotCapitalPaused nonReentrant {
        require(msg.value > 0, "Amount must be greater than 0");
        IWETH9(address(wETH)).deposit{value: msg.value}();
        _mint(msg.value);
    }

    /**
     * @dev Deposit WETH and mint OETH.
     */
    function mint(uint256 _amount) external whenNotCapitalPaused nonReentrant {
        require(_amount > 0, "Amount must be greater than 0");
        wETH.safeTransferFrom(msg.sender, address(this), _amount);
        _mint(_amount);
    }

    /**
     * @dev Withdraw wETH and burn OETH.
     * @param _amount Amount of OETH to burn
     */
    function redeem(uint256 _amount)
        external
        whenNotCapitalPaused
        nonReentrant
    {
        _redeem(_amount);
    }

    /**
     * @dev Withdraw wETH and burn OETH.
     * @param _amount Amount of OETH to burn
     */
    function _redeem(uint256 _amount) internal {
        emit Redeem(msg.sender, _amount);

        require(oETH.balanceOf(msg.sender) >= _amount, "Insufficient balance");
        uint256 wethBalance = wETH.balanceOf(address(this));

        if (wethBalance >= _amount) {
            wETH.safeTransfer(msg.sender, _amount);
        } else {
            require(address(defaultStrategy) != address(0), "Liquidity error");
            defaultStrategy.withdraw(msg.sender, address(wETH), _amount);
        }

        oETH.burn(msg.sender, _amount);

        // Until we can prove that we won't affect the prices of our assets
        // by withdrawing them, this should be here.
        // It's possible that a strategy was off on its asset total, perhaps
        // a reward token sold for more or for less than anticipated.
        if (_amount >= rebaseThreshold && !rebasePaused) {
            _rebase();
        }
    }

    /**
     * @notice Withdraw wETH and burn all OETH.
     */
    function redeemAll()
        external
        whenNotCapitalPaused
        nonReentrant
    {
        _redeem(oETH.balanceOf(msg.sender));
    }

    /**
     * @notice Allocate unallocated funds on Vault to strategies.
     * @dev Allocate unallocated funds on Vault to strategies.
     **/
    function allocate() external whenNotCapitalPaused nonReentrant {
        _allocate();
    }

    /**
     * @notice Allocate unallocated funds on Vault to strategies.
     * @dev Allocate unallocated funds on Vault to strategies.
     **/
    function _allocate() internal {
        uint256 vaultValue = _totalValueInVault();
        // Nothing in vault to allocate
        if (vaultValue == 0) return;
        uint256 strategiesValue = _totalValueInStrategies();
        // We have a method that does the same as this, gas optimisation
        uint256 calculatedTotalValue = vaultValue.add(strategiesValue);

        // We want to maintain a buffer on the Vault so calculate a percentage
        // modifier to multiply each amount being allocated by to enforce the
        // vault buffer
        uint256 vaultBufferModifier;
        if (strategiesValue == 0) {
            // Nothing in Strategies, allocate 100% minus the vault buffer to
            // strategies
            vaultBufferModifier = uint256(1e18).sub(vaultBuffer);
        } else {
            vaultBufferModifier = vaultBuffer.mul(calculatedTotalValue).div(
                vaultValue
            );
            if (1e18 > vaultBufferModifier) {
                // E.g. 1e18 - (1e17 * 10e18)/5e18 = 8e17
                // (5e18 * 8e17) / 1e18 = 4e18 allocated from Vault
                vaultBufferModifier = uint256(1e18).sub(vaultBufferModifier);
            } else {
                // We need to let the buffer fill
                return;
            }
        }
        if (vaultBufferModifier == 0) return;

        uint256 allocateAmount = vaultValue.mulTruncate(
            vaultBufferModifier
        );

        if (allocateAmount > 0 && address(defaultStrategy) != address(0)) {
            wETH.safeTransfer(address(defaultStrategy), allocateAmount);
            defaultStrategy.deposit(address(wETH), allocateAmount);
            emit AssetAllocated(address(defaultStrategy), allocateAmount);
        }
    }

    /**
     * @dev Calculate the total value of assets held by the Vault and all
     *      strategies and update the supply of OETH.
     */
    function rebase() external virtual nonReentrant {
        _rebase();
    }

    /**
     * @dev Calculate the total value of assets held by the Vault and all
     *      strategies and update the supply of OETH, optionally sending a
     *      portion of the yield to the trustee.
     */
    function _rebase() internal whenNotRebasePaused {
        uint256 oethSupply = oETH.totalSupply();
        if (oethSupply == 0) {
            return;
        }
        uint256 vaultValue = _checkBalance();

        // Yield fee collection
        address _trusteeAddress = trusteeAddress; // gas savings
        if (_trusteeAddress != address(0) && (vaultValue > oethSupply)) {
            uint256 yield = vaultValue.sub(oethSupply);
            uint256 fee = yield.mul(trusteeFeeBps).div(10000);
            require(yield > fee, "Fee must not be greater than yield");
            if (fee > 0) {
                oETH.mint(_trusteeAddress, fee);
            }
            emit YieldDistribution(_trusteeAddress, yield, fee);
        }

        // Only rachet OETH supply upwards
        oethSupply = oETH.totalSupply(); // Final check should use latest value
        if (vaultValue > oethSupply) {
            oETH.changeSupply(vaultValue);
        }
    }

    /**
     * @dev Determine the total value of assets held by the vault and its
     *         strategies.
     * @return value Total value in ETH (1e18)
     */
    function totalValue() external view virtual returns (uint256 value) {
        value = _checkBalance();
    }

    /**
     * @dev Internal to calculate total value of all assets held in Vault.
     * @return value Total value in ETH (1e18)
     */
    function _totalValueInVault() internal view returns (uint256 value) {
        value = wETH.balanceOf(address(this));
    }

    /**
     * @dev Internal to calculate total value of all assets held in Strategies.
     * @return value Total value in ETH (1e18)
     */
    function _totalValueInStrategies() internal view returns (uint256 value) {
        for (uint256 i = 0; i < allStrategies.length; i++) {
            value = value.add(_totalValueInStrategy(allStrategies[i]));
        }
    }

    /**
     * @dev Internal to calculate total value of all assets held by strategy.
     * @param _strategyAddr Address of the strategy
     * @return value Total value in ETH (1e18)
     */
    function _totalValueInStrategy(address _strategyAddr)
        internal
        view
        returns (uint256 value)
    {
        IStrategy strategy = IStrategy(_strategyAddr);
        return strategy.checkBalance(address(wETH));
    }

    /**
     * @notice Get the balance of an asset held in Vault and all strategies.
     * @return uint256 Balance of asset in decimals of asset
     */
    function checkBalance() external view returns (uint256) {
        return _checkBalance();
    }

    /**
     * @notice Get the balance of ETH held in Vault and all strategies.
     * @return balance Balance in wei
     */
    function _checkBalance()
        internal
        view
        virtual
        returns (uint256 balance)
    {
        balance = wETH.balanceOf(address(this));
        for (uint256 i = 0; i < allStrategies.length; i++) {
            IStrategy strategy = IStrategy(allStrategies[i]);
            balance = balance.add(strategy.checkBalance(address(wETH)));
        }
    }

    /***************************************
                    Utils
    ****************************************/
    /**
     * @dev Return the number of strategies active on the Vault.
     */
    function getStrategyCount() external view returns (uint256) {
        return allStrategies.length;
    }

    /**
     * @dev Return the array of all strategies
     */
    function getAllStrategies() external view returns (address[] memory) {
        return allStrategies;
    }

    /**
     * @dev Falldown to the admin implementation
     * @notice This is a catch all for all functions not declared in core
     */
    // solhint-disable-next-line no-complex-fallback
    fallback() external payable {
        bytes32 slot = adminImplPosition;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize())

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(
                gas(),
                sload(slot),
                0,
                calldatasize(),
                0,
                0
            )

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize())

            switch result
            // delegatecall returns 0 on error.
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }

    function abs(int256 x) private pure returns (uint256) {
        require(x < int256(MAX_INT), "Amount too high");
        return x >= 0 ? uint256(x) : uint256(-x);
    }
}
