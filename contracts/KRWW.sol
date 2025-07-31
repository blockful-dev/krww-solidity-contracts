// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract KRWW is ERC20, ERC20Burnable, ERC20Pausable, AccessControl, ERC20Permit {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLIST_MANAGER_ROLE = keccak256("BLACKLIST_MANAGER_ROLE");

    mapping(address => bool) private _blacklisted;

    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    error BlacklistedAccount(address account);
    error ZeroAddress();
    error ZeroAmount();

    constructor(address defaultAdmin)
        ERC20("Korean Won Wonder", "KRWW")
        ERC20Permit("KRWW")
    {
        if (defaultAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(MINTER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(BLACKLIST_MANAGER_ROLE, defaultAdmin);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (_blacklisted[to]) revert BlacklistedAccount(to);

        _mint(to, amount);
        emit Mint(to, amount);
    }

    function burn(uint256 amount) public override {
        if (amount == 0) revert ZeroAmount();
        if (_blacklisted[msg.sender]) revert BlacklistedAccount(msg.sender);

        super.burn(amount);
        emit Burn(msg.sender, amount);
    }

    function burnFrom(address account, uint256 amount) public override {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (_blacklisted[account]) revert BlacklistedAccount(account);

        super.burnFrom(account, amount);
        emit Burn(account, amount);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function blacklist(address account) public onlyRole(BLACKLIST_MANAGER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (!_blacklisted[account]) {
            _blacklisted[account] = true;
            emit Blacklisted(account);
        }
    }

    function unBlacklist(address account) public onlyRole(BLACKLIST_MANAGER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (_blacklisted[account]) {
            _blacklisted[account] = false;
            emit UnBlacklisted(account);
        }
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklisted[account];
    }

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        if (from != address(0) && _blacklisted[from]) revert BlacklistedAccount(from);
        if (to != address(0) && _blacklisted[to]) revert BlacklistedAccount(to);

        super._update(from, to, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}