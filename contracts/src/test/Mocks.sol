// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// Test doubles for the two protocol contracts ArcadeEngine reads. Not deployed.

contract MockMarketsModule {
    struct Row {
        address market;
        uint256 yesId;
        uint256 noId;
    }

    mapping(bytes32 => Row) private rows;

    function setMarket(bytes32 marketId, address market, uint256 yesId, uint256 noId) external {
        rows[marketId] = Row({market: market, yesId: yesId, noId: noId});
    }

    function markets(bytes32 marketId)
        external
        view
        returns (
            uint256 oracleQuestionId,
            uint8 outcomeSlotCount,
            uint8 voidPolicy,
            address collateral,
            uint32 originOperatorId,
            bytes32 originVenueId,
            address oracleAdapter,
            address creator,
            address market,
            address pool,
            uint256 yesId,
            uint256 noId,
            uint64 tradingStart,
            uint64 expiry
        )
    {
        Row memory r = rows[marketId];
        return (
            0, 2, 0, address(0), 0, bytes32(0), address(0), address(0),
            r.market, address(0), r.yesId, r.noId, 0, 0
        );
    }
}

/// A settled BinaryMarket. Its payout vector is the authoritative outcome —
/// deliberately independent of whatever the oracle event carried.
contract MockBinaryMarket {
    uint256[] private numerators;
    bool public isResolved;
    bool public isVoided;

    function setOutcome(bool resolved, bool voided, uint256 yesNum, uint256 noNum) external {
        isResolved = resolved;
        isVoided = voided;
        delete numerators;
        numerators.push(yesNum);
        numerators.push(noNum);
    }

    function payoutNumerators() external view returns (uint256[] memory) {
        return numerators;
    }
}

/// A market that reverts on every read — the engine must skip it, not revert.
contract RevertingMarket {
    function isResolved() external pure returns (bool) {
        revert("nope");
    }
}

contract MockOutcomeToken {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function mint(address to, uint256 id, uint256 amount) external {
        balanceOf[to][id] += amount;
    }
}
