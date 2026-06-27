// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./SuccessToken.sol";
import "./AchievementBadge.sol";

contract RewardManager is AccessControl {
    bytes32 public constant INSTRUCTOR_ROLE = keccak256("INSTRUCTOR_ROLE");

    SuccessToken public successToken;

    AchievementBadge public achievementBadge;

    mapping(address => uint256) public totalEarned;

    mapping(address => mapping(uint256 => bool)) public badgeAwarded;

    struct Milestone {
        uint256 threshold;
        uint256 level;
        string name;
    }

    Milestone[] public milestones;

    event ActivityApproved(
        address indexed instructor,
        address indexed student,
        uint256 amount,
        string activityRef
    );

    event BadgeAwarded(
        address indexed student,
        uint256 indexed milestoneIndex,
        uint256 tokenId,
        string name
    );

    event AchievementBadgeSet(address indexed badge);

    constructor(address tokenAddress, address adminAddress) {
        require(tokenAddress != address(0), "RewardManager: zero token address");
        require(adminAddress != address(0), "RewardManager: zero admin address");

        successToken = SuccessToken(tokenAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, adminAddress);

        milestones.push(Milestone(50 ether, 1, "Active Member"));
        milestones.push(Milestone(100 ether, 2, "Star Performer"));
        milestones.push(Milestone(200 ether, 3, "Campus Legend"));
    }

    function setAchievementBadge(address badgeAddress)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(badgeAddress != address(0), "RewardManager: zero badge address");
        achievementBadge = AchievementBadge(badgeAddress);
        emit AchievementBadgeSet(badgeAddress);
    }

    function milestoneCount() external view returns (uint256) {
        return milestones.length;
    }

    function approveActivity(
        address student,
        uint256 amount,
        string calldata activityRef
    ) external onlyRole(INSTRUCTOR_ROLE) {
        require(student != address(0), "RewardManager: zero student address");
        require(amount > 0, "RewardManager: amount must be > 0");
        require(bytes(activityRef).length > 0, "RewardManager: empty activity reference");

        successToken.mint(student, amount);

        totalEarned[student] += amount;

        emit ActivityApproved(msg.sender, student, amount, activityRef);

        _checkMilestones(student);
    }

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

    function studentBalance(address student) external view returns (uint256) {
        return successToken.balanceOf(student);
    }
}
