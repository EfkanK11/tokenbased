// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./SuccessToken.sol";

/**
 * @title RewardManager
 * @dev Manages instructor permissions and triggers token minting.
 *      Instructors (INSTRUCTOR_ROLE) can approve student activity submissions,
 *      which automatically mints SuccessTokens to the student's wallet.
 *
 *      Role hierarchy:
 *        DEFAULT_ADMIN_ROLE → can grant / revoke INSTRUCTOR_ROLE
 *        INSTRUCTOR_ROLE    → can call approveActivity()
 *
 * Project: Token-Based Success Award and Gamification System
 * Developer: Efkan Kasaboğlu (220304023)
 */
contract RewardManager is AccessControl {
    // ─── Roles ────────────────────────────────────────────────────────────────

    /// @dev Role identifier for instructors who can approve activities
    bytes32 public constant INSTRUCTOR_ROLE = keccak256("INSTRUCTOR_ROLE");

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice The SuccessToken contract this manager controls
    SuccessToken public successToken;

    // ─── Events ───────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when an instructor approves a student activity.
     * @param instructor  Address of the approving instructor.
     * @param student     Address of the rewarded student.
     * @param amount      Tokens minted (SCT, 18 decimals).
     * @param activityRef Arbitrary reference string (e.g., activity ID or IPFS CID).
     */
    event ActivityApproved(
        address indexed instructor,
        address indexed student,
        uint256 amount,
        string activityRef
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param tokenAddress  Deployed SuccessToken contract address.
     * @param adminAddress  Address that will hold DEFAULT_ADMIN_ROLE
     *                      (can grant / revoke instructor roles).
     */
    constructor(address tokenAddress, address adminAddress) {
        require(tokenAddress != address(0), "RewardManager: zero token address");
        require(adminAddress != address(0), "RewardManager: zero admin address");

        successToken = SuccessToken(tokenAddress);

        // Grant DEFAULT_ADMIN_ROLE to the deployer / system admin
        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);
    }

    // ─── Core Logic ───────────────────────────────────────────────────────────

    /**
     * @notice Approve a student's campus activity and mint reward tokens.
     * @dev Caller must have INSTRUCTOR_ROLE.
     *      RewardManager must be the owner of the SuccessToken contract.
     *
     * @param student     Student wallet address to receive tokens.
     * @param amount      Number of SCT tokens to mint (in wei, e.g. 10 * 1e18 = 10 SCT).
     * @param activityRef Reference string identifying the activity
     *                    (e.g., "event-001" or an IPFS CID for future use).
     */
    function approveActivity(
        address student,
        uint256 amount,
        string calldata activityRef
    ) external onlyRole(INSTRUCTOR_ROLE) {
        require(student != address(0), "RewardManager: zero student address");
        require(amount > 0, "RewardManager: amount must be > 0");
        require(bytes(activityRef).length > 0, "RewardManager: empty activity reference");

        // Mint tokens → SuccessToken.mint() checks that caller is its owner
        successToken.mint(student, amount);

        emit ActivityApproved(msg.sender, student, amount, activityRef);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Returns the SCT token balance of a student.
     * @param student Wallet address to query.
     */
    function studentBalance(address student) external view returns (uint256) {
        return successToken.balanceOf(student);
    }
}
