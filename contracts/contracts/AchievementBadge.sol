// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title AchievementBadge
 * @dev ERC-721 NFT representing campus achievement milestones.
 *      Only the contract owner (RewardManager) can mint badges.
 *      Badges are awarded automatically when a student crosses an SCT
 *      earning milestone (see RewardManager).
 *
 *      Metadata is generated fully on-chain (base64 data URI), so no IPFS
 *      pin is required for the NFT to render its name, level, and artwork.
 *
 * Project: Token-Based Success Award and Gamification System
 * Developer: Efkan Kasaboğlu (220304023)
 */
contract AchievementBadge is ERC721, Ownable {
    using Strings for uint256;

    // ─── State ──────────────────────────────────────────────────────────────

    /// @dev Auto-incrementing token id counter (first minted token id = 1)
    uint256 private _nextTokenId = 1;

    /// @notice Milestone level associated with a token id (1, 2, 3, …)
    mapping(uint256 => uint256) public levelOf;

    /// @notice Human-readable badge name for a token id
    mapping(uint256 => string) public nameOf;

    // ─── Events ─────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new achievement badge is minted.
     * @param student  Wallet receiving the badge.
     * @param tokenId  Newly minted token id.
     * @param level    Milestone level of the badge.
     * @param name     Human-readable badge name.
     */
    event BadgeMinted(
        address indexed student,
        uint256 indexed tokenId,
        uint256 level,
        string name
    );

    // ─── Constructor ────────────────────────────────────────────────────────

    /**
     * @param initialOwner Address that will own this contract (transferred to
     *        RewardManager after deployment so only it can mint).
     */
    constructor(address initialOwner)
        ERC721("Campus Achievement Badge", "BADGE")
        Ownable(initialOwner)
    {}

    // ─── Mint ───────────────────────────────────────────────────────────────

    /**
     * @notice Mint an achievement badge to `student`.
     * @dev Can only be called by the owner (RewardManager).
     * @param student Wallet address receiving the badge.
     * @param level   Milestone level (1, 2, 3, …).
     * @param name    Human-readable badge name.
     * @return tokenId The id of the freshly minted token.
     */
    function mint(
        address student,
        uint256 level,
        string calldata name
    ) external onlyOwner returns (uint256 tokenId) {
        require(student != address(0), "AchievementBadge: mint to zero address");
        require(level > 0, "AchievementBadge: level must be > 0");
        require(bytes(name).length > 0, "AchievementBadge: empty name");

        tokenId = _nextTokenId++;
        levelOf[tokenId] = level;
        nameOf[tokenId] = name;

        _safeMint(student, tokenId);
        emit BadgeMinted(student, tokenId, level, name);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    /// @notice Total number of badges minted so far.
    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /**
     * @notice On-chain ERC-721 metadata as a base64-encoded data URI.
     * @dev Builds JSON (with an inline SVG image) without any external host.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        _requireOwned(tokenId);

        uint256 level = levelOf[tokenId];
        string memory name = nameOf[tokenId];

        string memory image = Base64.encode(bytes(_svg(name, level)));

        string memory json = string(
            abi.encodePacked(
                '{"name":"', name, ' #', tokenId.toString(),
                '","description":"Campus Achievement Badge awarded for reaching an SCT earning milestone in the Token-Based Success Award System.",',
                '"attributes":[{"trait_type":"Level","value":', level.toString(),
                '},{"trait_type":"Badge","value":"', name,
                '"}],"image":"data:image/svg+xml;base64,', image, '"}'
            )
        );

        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                Base64.encode(bytes(json))
            )
        );
    }

    // ─── Internal ───────────────────────────────────────────────────────────

    /// @dev Builds a simple inline SVG artwork for the badge.
    function _svg(string memory name, uint256 level)
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#0f1117"/>',
                '<circle cx="200" cy="160" r="90" fill="none" stroke="#6366f1" stroke-width="8"/>',
                '<text x="200" y="180" font-family="sans-serif" font-size="64" fill="#4ade80" text-anchor="middle">',
                unicode"🏆",
                '</text>',
                '<text x="200" y="300" font-family="sans-serif" font-size="28" fill="#ffffff" text-anchor="middle" font-weight="bold">',
                name,
                '</text>',
                '<text x="200" y="340" font-family="sans-serif" font-size="18" fill="#9ca3af" text-anchor="middle">Level ',
                level.toString(),
                '</text></svg>'
            )
        );
    }
}
