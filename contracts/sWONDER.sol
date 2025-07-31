// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract sWONDER is ERC4626, ERC20Pausable, AccessControl, ERC20Permit {
    bytes32 public constant VAULT_MANAGER_ROLE = keccak256("VAULT_MANAGER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLIST_MANAGER_ROLE = keccak256("BLACKLIST_MANAGER_ROLE");

    mapping(address => bool) private _blacklisted;
    mapping(address => uint256) private _depositTimestamp;

    uint256 public constant COOLDOWN_PERIOD = 7 days;

    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event RewardsDistributed(uint256 amount);

    error BlacklistedAccount(address account);
    error ZeroAddress();
    error CooldownNotMet();

    constructor(
        address defaultAdmin,
        IERC20 _asset
    )
        ERC4626(_asset)
        ERC20("Staked Ethena WONDER", "sWONDER")
        ERC20Permit("Staked Ethena WONDER")
    {
        if (defaultAdmin == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(VAULT_MANAGER_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(BLACKLIST_MANAGER_ROLE, defaultAdmin);
    }

    function decimals() public pure override(ERC20, ERC4626) returns (uint8) {
        return 18;
    }

    function deposit(uint256 assets, address receiver) public override whenNotPaused returns (uint256) {
        if (_blacklisted[msg.sender] || _blacklisted[receiver]) revert BlacklistedAccount(msg.sender);

        uint256 shares = super.deposit(assets, receiver);
        _depositTimestamp[receiver] = block.timestamp;
        return shares;
    }

    function mint(uint256 shares, address receiver) public override whenNotPaused returns (uint256) {
        if (_blacklisted[msg.sender] || _blacklisted[receiver]) revert BlacklistedAccount(msg.sender);

        uint256 assets = super.mint(shares, receiver);
        _depositTimestamp[receiver] = block.timestamp;
        return assets;
    }

    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) public override returns (uint256) {
        if (_blacklisted[msg.sender] || _blacklisted[receiver] || _blacklisted[owner]) {
            revert BlacklistedAccount(msg.sender);
        }
        if (block.timestamp < _depositTimestamp[owner] + COOLDOWN_PERIOD) {
            revert CooldownNotMet();
        }

        return super.withdraw(assets, receiver, owner);
    }

    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) public override returns (uint256) {
        if (_blacklisted[msg.sender] || _blacklisted[receiver] || _blacklisted[owner]) {
            revert BlacklistedAccount(msg.sender);
        }
        if (block.timestamp < _depositTimestamp[owner] + COOLDOWN_PERIOD) {
            revert CooldownNotMet();
        }

        return super.redeem(shares, receiver, owner);
    }

    function distributeRewards(uint256 rewardAmount) external onlyRole(VAULT_MANAGER_ROLE) {
        IERC20(asset()).transferFrom(msg.sender, address(this), rewardAmount);
        emit RewardsDistributed(rewardAmount);
    }

    function getDepositTimestamp(address user) external view returns (uint256) {
        return _depositTimestamp[user];
    }

    function getCooldownRemaining(address user) external view returns (uint256) {
        uint256 elapsed = block.timestamp - _depositTimestamp[user];
        if (elapsed >= COOLDOWN_PERIOD) {
            return 0;
        }
        return COOLDOWN_PERIOD - elapsed;
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

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        if (from != address(0) && _blacklisted[from]) revert BlacklistedAccount(from);
        if (to != address(0) && _blacklisted[to]) revert BlacklistedAccount(to);

        super._update(from, to, value);
    }

    // Override required functions due to multiple inheritance
    function name() public pure override(ERC20, IERC20Metadata) returns (string memory) {
        return "Staked Ethena WONDER";
    }

    function symbol() public pure override(ERC20, IERC20Metadata) returns (string memory) {
        return "sWONDER";
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