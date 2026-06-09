// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SuccessToken
 * @dev ERC-20 token representing student achievement rewards.
 *      Only the contract owner (RewardManager) can mint new tokens.
 *      Students earn tokens when instructors approve their campus activities.
 *
 * Token: SCT (Success Token)
 * Project: Token-Based Success Award and Gamification System
 * Developer: Efkan Kasaboğlu (220304023)
 */
contract SuccessToken is ERC20, Ownable {
    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted whenever new tokens are minted to a student wallet
    event TokensMinted(address indexed student, uint256 amount);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param initialOwner Address that will own this contract (will be
     *        transferred to RewardManager after deployment).
     */
    constructor(address initialOwner)
        ERC20("SuccessToken", "SCT")
        Ownable(initialOwner)
    {}

    // ─── Mint ─────────────────────────────────────────────────────────────────

    /**
     * @notice Mint `amount` SCT tokens to `student`.
     * @dev Can only be called by the contract owner (RewardManager).
     * @param student  Wallet address of the student receiving the reward.
     * @param amount   Number of tokens to mint (in wei units, 18 decimals).
     */
    function mint(address student, uint256 amount) external onlyOwner {
        require(student != address(0), "SuccessToken: mint to zero address");
        require(amount > 0, "SuccessToken: amount must be > 0");

        _mint(student, amount);
        emit TokensMinted(student, amount);
    }
}
