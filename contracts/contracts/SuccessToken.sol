// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SuccessToken is ERC20, Ownable {
    event TokensMinted(address indexed student, uint256 amount);

    constructor(address initialOwner)
        ERC20("SuccessToken", "SCT")
        Ownable(initialOwner)
    {}

    function mint(address student, uint256 amount) external onlyOwner {
        require(student != address(0), "SuccessToken: mint to zero address");
        require(amount > 0, "SuccessToken: amount must be > 0");

        _mint(student, amount);
        emit TokensMinted(student, amount);
    }
}
