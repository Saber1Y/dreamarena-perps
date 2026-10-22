// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";

/// Test doubles for what PerpsArena reads and calls. Not deployed.

contract MockMarginBank {
    struct Position {
        int128 size;
        uint128 avgEntryPrice;
        int256 entryFundingIndex;
        uint64 lastUpdatedTimestampNs;
    }

    mapping(address => mapping(address => int128)) private sizes;
    mapping(address => bool) public isPerpPoolRegistered;

    function registerPool(address pool, bool registered) external {
        isPerpPoolRegistered[pool] = registered;
    }

    function setSize(address account, address pool, int128 size) external {
        sizes[account][pool] = size;
    }

    function getPosition(address account, address pool) external view returns (Position memory p) {
        p.size = sizes[account][pool];
    }
}

contract MockPerpPool {
    /// owner => operator => selector => allowed
    mapping(address => mapping(address => mapping(bytes4 => bool))) private grants;

    function setOperator(address owner, address operator, bytes4 selector, bool allowed) external {
        grants[owner][operator][selector] = allowed;
    }

    function isOperatorAuthorized(address owner, address operator, bytes4 selector) external view returns (bool) {
        return grants[owner][operator][selector];
    }
}

/// Installed at 0x0100 with hardhat_setCode. Records subscriptions so tests
/// can assert the filters, and can be told to fail unsubscribes.
contract MockReactivityPrecompile {
    uint256 public nextId;
    bool public failUnsubscribe;
    mapping(uint256 => ISomniaReactivityPrecompile.SubscriptionData) private subs;
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => bool) public active;

    function setFailUnsubscribe(bool value) external {
        failUnsubscribe = value;
    }

    function subscribe(ISomniaReactivityPrecompile.SubscriptionData calldata data) external returns (uint256 id) {
        id = ++nextId;
        subs[id] = data;
        ownerOf[id] = msg.sender;
        active[id] = true;
    }

    function unsubscribe(uint256 id) external {
        require(!failUnsubscribe, "unsubscribe failed");
        require(ownerOf[id] == msg.sender && active[id], "not owner or inactive");
        active[id] = false;
    }

    function getSubscriptionInfo(uint256 id)
        external
        view
        returns (ISomniaReactivityPrecompile.SubscriptionData memory, address)
    {
        return (subs[id], ownerOf[id]);
    }
}
