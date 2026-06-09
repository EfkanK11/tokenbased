// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./SuccessToken.sol";
import "./AchievementBadge.sol";

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

    /// @notice The AchievementBadge (ERC-721) contract this manager mints from.
    ///         Optional: badge minting is skipped while this is unset (address 0).
    AchievementBadge public achievementBadge;

    /// @notice Cumulative SCT ever earned by a student (never decreases, even
    ///         if tokens are later transferred away). Used for badge milestones.
    mapping(address => uint256) public totalEarned;

    /// @notice Whether a student has already been awarded the badge at a given
    ///         milestone index (into the `milestones` array).
    mapping(address => mapping(uint256 => bool)) public badgeAwarded;

    /// @dev A badge milestone: earn `threshold` cumulative SCT to unlock `name`.
    struct Milestone {
        uint256 threshold; // in wei (18 decimals)
        uint256 level;     // badge level (1, 2, 3, …)
        string name;       // human-readable badge name
    }

    /// @notice Ordered list of badge milestones (ascending thresholds).
    Milestone[] public milestones;

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

    /**
     * @notice Emitted when a student is awarded an achievement badge.
     * @param student        Address of the rewarded student.
     * @param milestoneIndex Index into the `milestones` array.
     * @param tokenId        Minted ERC-721 token id.
     * @param name           Human-readable badge name.
     */
    event BadgeAwarded(
        address indexed student,
        uint256 indexed milestoneIndex,
        uint256 tokenId,
        string name
    );

    /// @notice Emitted when the admin sets / updates the badge contract.
    event AchievementBadgeSet(address indexed badge);

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

        // Seed default badge milestones (ascending thresholds).
        milestones.push(Milestone(50 ether, 1, "Active Member"));
        milestones.push(Milestone(100 ether, 2, "Star Performer"));
        milestones.push(Milestone(200 ether, 3, "Campus Legend"));
    }

    // ─── Admin: Badge Wiring ────────────────────────────────────────────────────

    /**
     * @notice Set (or update) the AchievementBadge contract used for milestones.
     * @dev Caller must hold DEFAULT_ADMIN_ROLE. RewardManager must be the owner
     *      of the badge contract for minting to succeed.
     * @param badgeAddress Deployed AchievementBadge contract address.
     */
    function setAchievementBadge(address badgeAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(badgeAddress != address(0), "RewardManager: zero badge address");
        achievementBadge = AchievementBadge(badgeAddress);
        emit AchievementBadgeSet(badgeAddress);
    }

    /// @notice Number of configured badge milestones.
    function milestoneCount() external view returns (uint256) {
        return milestones.length;
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

        // Track lifetime earnings and award any newly-unlocked badges.
        totalEarned[student] += amount;

        emit ActivityApproved(msg.sender, student, amount, activityRef);

        _checkMilestones(student);
    }

    /**
     * @dev Mint achievement badges for any milestone the student has newly
     *      crossed. Skipped entirely if no badge contract is wired, and a
     *      failed badge mint never blocks the core token reward.
     * @param student Student whose cumulative earnings to evaluate.
     */
    function _checkMilestones(address student) internal {
        if (address(achievementBadge) == address(0)) return;

        uint256 earned = totalEarned[student];
        uint256 count = milestones.length;

        for (uint256 i = 0; i < count; i++) {
            if (badgeAwarded[student][i]) continue;
            if (earned < milestones[i].threshold) continue;

            badgeAwarded[student][i] = true;
            uint256 tokenId = achievementBadge.mint(
                student,
                milestones[i].level,
                milestones[i].name
            );
            emit BadgeAwarded(student, i, tokenId, milestones[i].name);
        }
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
