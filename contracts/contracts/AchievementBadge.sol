// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract AchievementBadge is ERC721, Ownable {
    using Strings for uint256;

    uint256 private _nextTokenId = 1;

    mapping(uint256 => uint256) public levelOf;

    mapping(uint256 => string) public nameOf;

    event BadgeMinted(
        address indexed student,
        uint256 indexed tokenId,
        uint256 level,
        string name
    );

    constructor(address initialOwner)
        ERC721("Campus Achievement Badge", "BADGE")
        Ownable(initialOwner)
    {}

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

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

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

    function _palette(uint256 level)
        internal
        pure
        returns (string memory main, string memory dark)
    {
        if (level >= 3) return ("#d9b13b", "#9c7611");
        if (level == 2) return ("#8c9197", "#5a5f66");
        return ("#b5733a", "#8a4f24");
    }

    function _svg(string memory name, uint256 level)
        internal
        pure
        returns (string memory)
    {
        (string memory main, string memory dark) = _palette(level);
        return string(
            abi.encodePacked(
                _svgTop(main, dark),
                _svgBottom(name, level.toString(), main)
            )
        );
    }

    function _svgTop(string memory main, string memory dark)
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#f0e7d4"/>',
                '<rect x="14" y="14" width="372" height="372" rx="14" fill="#fbf7ec" stroke="#c4b48f" stroke-width="2"/>',
                '<rect x="48" y="46" width="304" height="3" fill="', main, '"/>',
                '<circle cx="200" cy="168" r="88" fill="#fbf7ec" stroke="', main, '" stroke-width="9"/>',
                '<circle cx="200" cy="168" r="72" fill="none" stroke="', dark, '" stroke-width="2"/>',
                '<path d="M200 120 211 153 246 153 218 174 228 207 200 187 172 207 182 174 154 153 189 153 Z" fill="', main, '" stroke="', dark, '" stroke-width="2" stroke-linejoin="round"/>'
            )
        );
    }

    function _svgBottom(string memory name, string memory lvl, string memory main)
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<text x="200" y="178" font-family="Georgia,serif" font-size="30" font-weight="bold" fill="#fdf8ec" text-anchor="middle">', lvl, '</text>',
                '<text x="200" y="306" font-family="Georgia,serif" font-size="30" font-weight="bold" fill="#1c1813" text-anchor="middle">', name, '</text>',
                '<text x="200" y="338" font-family="monospace" font-size="15" letter-spacing="3" fill="#6a6051" text-anchor="middle">LEVEL ', lvl, '</text>',
                '<text x="200" y="372" font-family="monospace" font-size="11" letter-spacing="4" fill="', main, '" text-anchor="middle">LAUREL - SCT</text>',
                '</svg>'
            )
        );
    }
}
