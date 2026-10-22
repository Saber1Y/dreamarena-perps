// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IBinaryMarketsModule {
    /// Real BinaryMarketsModule signature — market ids are bytes32, not uint256.
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
        );
}

interface IERC6909 {
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

interface IBinaryMarket {
    /// Per-outcome payout numerators, indexed the MARKET's way: 0 = YES, 1 = NO.
    function payoutNumerators() external view returns (uint256[] memory);
    function isResolved() external view returns (bool);
    function isVoided() external view returns (bool);
}

/**
 * @title ArcadeEngine
 * @notice The gamification ledger for DreamArena. It holds no funds and moves no
 *         money: players trade real YES/NO outcome shares on DreamDEX's binary
 *         pools, and this contract records the entry, then reacts to the
 *         OracleHub's own resolution to keep streaks, multipliers and the
 *         leaderboard.
 *
 * @dev The reactive leg is the point. `OracleHub` resolves a market and emits
 *      `AnswerDelivered`; the Somnia reactivity precompile (0x0100) dispatches
 *      that log straight into `onEvent` in the same block. No keeper, no cron,
 *      no backend — which is exactly what the arcade's "instant settlement"
 *      feel is made of.
 *
 *      Custody was deliberately removed. An earlier version escrowed stakes and
 *      paid a fixed 1.9x from a house bankroll, which meant a fake price oracle,
 *      an unfunded treasury, and real user money sitting in hackathon code.
 *      Payouts are now the market's own redemption, settled by the protocol.
 */
contract ArcadeEngine is SomniaEventHandler, Ownable {
    // -------------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------------

    IBinaryMarketsModule public immutable marketsModule;
    IERC6909 public immutable outcomeToken;
    address public immutable oracleHub;

    /// OracleHub emits this the moment a market's answer lands on-chain.
    /// event AnswerDelivered(uint256 indexed oracleQuestionId, bytes32 indexed marketId,
    ///                       uint32 payoutDenominator, uint256[] payoutNumerators, bool voided)
    bytes32 public constant ANSWER_DELIVERED_SIG =
        keccak256("AnswerDelivered(uint256,bytes32,uint32,uint256[],bool)");

    /// Live reactivity subscription id, 0 until `subscribeToOracle` runs.
    uint256 public subscriptionId;

    /// ponytail: entries resolved per reactive callback. The subscription buys a
    /// fixed gas budget, so an unbounded loop would silently truncate and drop
    /// players' streaks. Anything past the cap is swept by `resolveTail`.
    uint256 public constant MAX_RESOLVES_PER_CALLBACK = 40;

    // -------------------------------------------------------------------------
    // Game state
    // -------------------------------------------------------------------------

    enum GameType {
        HigherOrLower,
        StreakSurvivor,
        BossBattle
    }

    /// Rounds a Boss Battle run must win, back to back, to slay the boss.
    uint256 public constant BOSS_ROUNDS = 3;

    struct Entry {
        bool up; // true = YES / higher, false = NO / lower
        /// Position size in OUTCOME-TOKEN units (6dp) — the shares the fill
        /// actually produced, which is what `balanceOf` can be checked against.
        /// The tUSDC cost is `shares x fill price` and lives off-chain with the
        /// order; this contract keeps streaks, not books.
        uint256 shares;
        bool resolved;
        bool won;
        GameType gameType;
    }

    struct Outcome {
        bool resolved;
        bool yesWon;
        bool voided;
    }

    /// marketId => player => their entry
    mapping(bytes32 => mapping(address => Entry)) public entries;
    /// marketId => everyone who entered, in order (the resolve queue)
    mapping(bytes32 => address[]) public entrants;
    /// marketId => how far through `entrants` we have resolved
    mapping(bytes32 => uint256) public resolveCursor;
    /// marketId => the oracle's answer, once delivered
    mapping(bytes32 => Outcome) public outcomes;

    mapping(address => uint256) public streak;
    mapping(address => uint256) public longestStreak;
    mapping(address => uint256) public totalWins;
    mapping(address => uint256) public totalLosses;
    mapping(address => uint256) public totalShares;

    /// Rounds won so far in the player's current Boss Battle run (0..2; a third
    /// win slays the boss and resets it).
    mapping(address => uint256) public bossRound;
    mapping(address => uint256) public bossesSlain;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event EntryRecorded(
        bytes32 indexed marketId,
        address indexed player,
        bool up,
        uint256 shares,
        GameType gameType
    );
    event GameResolved(
        bytes32 indexed marketId,
        address indexed player,
        bool won,
        uint256 newStreak,
        uint256 shares
    );
    event MarketVoided(bytes32 indexed marketId);
    event StreakUpdated(address indexed player, uint256 streak, uint256 multiplier);
    event MilestoneReached(address indexed player, uint256 milestone, uint256 multiplier);
    event BossRoundWon(address indexed player, uint256 round, uint256 roundsRemaining);
    event BossDefeated(address indexed player, uint256 totalSlain);
    event BossRunEnded(address indexed player, uint256 roundReached);
    event OracleAnswered(bytes32 indexed marketId, bool yesWon, bool voided, uint256 entrantCount);
    event SubscriptionCreated(uint256 subscriptionId);

    error MarketUnknown();
    error AlreadyEntered();
    error NoPosition();
    error SharesZero();
    error NotResolved();

    constructor(address _marketsModule, address _outcomeToken, address _oracleHub)
        Ownable(msg.sender)
    {
        marketsModule = IBinaryMarketsModule(_marketsModule);
        outcomeToken = IERC6909(_outcomeToken);
        oracleHub = _oracleHub;
    }

    // -------------------------------------------------------------------------
    // Entry
    // -------------------------------------------------------------------------

    /**
     * @notice Record that the caller has taken a side on a live binary market.
     * @dev Called right after the real order fills on the DreamDEX pool. No
     *      transfer happens here — the position already exists as ERC-6909
     *      outcome shares, and we verify it rather than trust it, so the
     *      leaderboard cannot be farmed by calling this without trading.
     * @param shares Position size in outcome-token units, i.e. the quantity the
     *      order actually filled — NOT the tUSDC spent. Comparing a collateral
     *      amount against a share balance would be comparing two different units.
     */
    function recordEntry(bytes32 marketId, bool up, uint256 shares, GameType gameType) external {
        if (shares == 0) revert SharesZero();
        if (entries[marketId][msg.sender].shares != 0) revert AlreadyEntered();

        (,,,,,,,, address market,, uint256 yesId, uint256 noId,,) = marketsModule.markets(marketId);
        if (market == address(0)) revert MarketUnknown();

        // Proof of skin in the game: the player must actually hold the outcome
        // shares they claim. One read, and the streak system stops being a
        // free-to-mint number.
        if (outcomeToken.balanceOf(msg.sender, up ? yesId : noId) < shares) revert NoPosition();

        entries[marketId][msg.sender] =
            Entry({up: up, shares: shares, resolved: false, won: false, gameType: gameType});
        entrants[marketId].push(msg.sender);
        totalShares[msg.sender] += shares;

        emit EntryRecorded(marketId, msg.sender, up, shares, gameType);
    }

    // -------------------------------------------------------------------------
    // Reactive settlement
    // -------------------------------------------------------------------------

    /**
     * @dev Dispatched by the reactivity precompile when OracleHub answers a
     *      market. `SomniaEventHandler.onEvent` has already proven the caller is
     *      the precompile; we still pin the emitter and topic so a subscription
     *      widened later cannot feed this contract someone else's logs.
     */
    function _onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata /* data */)
        internal
        override
    {
        if (emitter != oracleHub) return;
        if (eventTopics.length < 3 || eventTopics[0] != ANSWER_DELIVERED_SIG) return;

        bytes32 marketId = eventTopics[2];

        // The event's payload is NOT usable as the outcome. Its numerators are
        // indexed in the ORACLE QUESTION's answer space, which a market maps
        // onto its own YES/NO space — and that mapping can invert. Observed on
        // testnet: AnswerDelivered carried [1e7, 0] while the market itself
        // settled [0, 1e7], so trusting the payload tells a losing player they
        // won. Read the market's own vector; it is authoritative, and the
        // oracle has already written it by the time this callback runs.
        (,,,,,,,, address market,,,,,) = marketsModule.markets(marketId);
        if (market == address(0)) return;

        (bool yesWon, bool voided, bool ok) = _readOutcome(market);
        if (!ok) return; // not resolved yet — nothing safe to settle on

        outcomes[marketId] = Outcome({resolved: true, yesWon: yesWon, voided: voided});
        emit OracleAnswered(marketId, yesWon, voided, entrants[marketId].length);

        if (voided) {
            // Nobody was wrong, so nobody's streak breaks. Entries stay open and
            // `resolveTail` will skip them.
            emit MarketVoided(marketId);
            return;
        }

        _resolve(marketId, MAX_RESOLVES_PER_CALLBACK);
    }

    /**
     * A Boss Battle run: three straight wins slays the boss, one loss ends it.
     *
     * @dev There is no bonus pot, because this contract holds no funds and
     *      never will. The reward is the on-chain record — `bossesSlain` is
     *      permanent, and a run is unfakeable because every round is a real
     *      position verified at entry.
     */
    function _advanceBoss(address player, bool won) internal {
        if (!won) {
            uint256 reached = bossRound[player];
            bossRound[player] = 0;
            if (reached > 0) emit BossRunEnded(player, reached);
            return;
        }

        uint256 round = bossRound[player] + 1;
        if (round >= BOSS_ROUNDS) {
            bossRound[player] = 0;
            bossesSlain[player]++;
            emit BossDefeated(player, bossesSlain[player]);
        } else {
            bossRound[player] = round;
            emit BossRoundWon(player, round, BOSS_ROUNDS - round);
        }
    }

    /**
     * Read a market's settled outcome from the market itself.
     *
     * Returns ok=false rather than reverting when the market cannot be read or
     * is not resolved: a revert inside the reactive callback would burn the
     * subscription's gas and drop every other market in the same batch.
     */
    function _readOutcome(address market)
        internal
        view
        returns (bool yesWon, bool voided, bool ok)
    {
        try IBinaryMarket(market).isResolved() returns (bool resolved) {
            if (!resolved) return (false, false, false);
        } catch {
            return (false, false, false);
        }

        try IBinaryMarket(market).isVoided() returns (bool v) {
            voided = v;
        } catch {}

        try IBinaryMarket(market).payoutNumerators() returns (uint256[] memory n) {
            if (n.length < 2) return (false, false, false);
            yesWon = n[0] > n[1];
            // A non-one-hot vector (a tie) is a void in everything but name.
            if (n[0] == n[1]) voided = true;
            return (yesWon, voided, true);
        } catch {
            return (false, false, false);
        }
    }

    /**
     * @notice Settle a market from its own on-chain state, without waiting for a
     *         reactive callback. Permissionless, idempotent, and a no-op once
     *         the queue is drained.
     *
     * @dev The safety net under the reactive path, and it is not optional.
     *      Observed on testnet: market 0x…ee08 reached `Finalized` with a real
     *      winner while OracleHub emitted NO `AnswerDelivered` for it — the hub
     *      batches its drain and some markets settle through paths that never
     *      produce the log our subscription is keyed on. With the callback as
     *      the only route, those entries hang forever.
     *
     *      The reactive path stays the fast path: it settles in the same block
     *      the oracle answers, with nobody running anything. This exists so that
     *      "usually instant" cannot become "sometimes never".
     */
    function settleMarket(bytes32 marketId, uint256 limit) external {
        if (!outcomes[marketId].resolved) {
            (,,,,,,,, address market,,,,,) = marketsModule.markets(marketId);
            if (market == address(0)) revert MarketUnknown();

            (bool yesWon, bool voided, bool ok) = _readOutcome(market);
            if (!ok) revert NotResolved();

            outcomes[marketId] = Outcome({resolved: true, yesWon: yesWon, voided: voided});
            emit OracleAnswered(marketId, yesWon, voided, entrants[marketId].length);
            if (voided) {
                emit MarketVoided(marketId);
                return;
            }
        }
        _resolve(marketId, limit);
    }

    /**
     * @notice Whether `settleMarket` would do anything for this market — i.e. it
     *         has entrants still waiting and its outcome is readable.
     */
    function needsSettlement(bytes32 marketId) external view returns (bool) {
        if (entrants[marketId].length == resolveCursor[marketId]) return false;
        if (outcomes[marketId].resolved) return !outcomes[marketId].voided;

        (,,,,,,,, address market,,,,,) = marketsModule.markets(marketId);
        if (market == address(0)) return false;
        (,, bool ok) = _readOutcome(market);
        return ok;
    }

    function _resolve(bytes32 marketId, uint256 limit) internal {
        Outcome memory outcome = outcomes[marketId];
        if (outcome.voided) return;

        address[] storage queue = entrants[marketId];
        uint256 i = resolveCursor[marketId];
        uint256 end = i + limit;
        if (end > queue.length) end = queue.length;

        for (; i < end; i++) {
            address player = queue[i];
            Entry storage entry = entries[marketId][player];
            if (entry.resolved) continue;

            bool won = (entry.up == outcome.yesWon);
            entry.resolved = true;
            entry.won = won;

            if (won) {
                totalWins[player]++;
                uint256 next = streak[player] + 1;
                streak[player] = next;
                if (next > longestStreak[player]) longestStreak[player] = next;

                uint256 multiplier = getMultiplier(player);
                emit StreakUpdated(player, next, multiplier);
                if (next == 3 || next == 7 || next == 14 || next == 30) {
                    emit MilestoneReached(player, next, multiplier);
                }
            } else {
                totalLosses[player]++;
                streak[player] = 0;
                emit StreakUpdated(player, 0, 100);
            }

            if (entry.gameType == GameType.BossBattle) _advanceBoss(player, won);

            emit GameResolved(marketId, player, won, streak[player], entry.shares);
        }

        resolveCursor[marketId] = i;
    }

    // -------------------------------------------------------------------------
    // Subscription management
    // -------------------------------------------------------------------------

    /**
     * @notice Open the reactivity subscription that powers settlement.
     * @dev The precompile requires THIS CONTRACT to hold at least 32 STT — it is
     *      the subscription owner and pays for every callback. Fund the engine
     *      before calling, not the deployer.
     */
    function subscribeToOracle(uint64 gasLimit) external onlyOwner returns (uint256) {
        SomniaExtensions.SubscriptionFilter memory filter = SomniaExtensions.SubscriptionFilter({
            eventTopics: [ANSWER_DELIVERED_SIG, bytes32(0), bytes32(0), bytes32(0)],
            origin: address(0),
            emitter: oracleHub
        });

        SomniaExtensions.SubscriptionOptions memory options =
            SomniaExtensions.defaultSubscriptionOptions();
        if (gasLimit != 0) options.gasLimit = gasLimit;

        subscriptionId = SomniaExtensions.subscribe(address(this), filter, options);
        emit SubscriptionCreated(subscriptionId);
        return subscriptionId;
    }

    function cancelSubscription() external onlyOwner {
        SomniaExtensions.unsubscribe(subscriptionId);
        subscriptionId = 0;
    }

    /// Top up the callback gas float. The engine pays for its own reactivity.
    receive() external payable {}

    function withdrawNative(address to, uint256 amount) external onlyOwner {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "withdraw failed");
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    /// Streak multiplier in basis points of 100 (100 = 1.00x, 200 = 2.00x).
    function getMultiplier(address player) public view returns (uint256) {
        uint256 s = streak[player];
        if (s >= 30) return 200;
        if (s >= 14) return 150;
        if (s >= 7) return 125;
        if (s >= 3) return 110;
        return 100;
    }

    function getPlayerStats(address player)
        external
        view
        returns (
            uint256 currentStreak,
            uint256 best,
            uint256 multiplier,
            uint256 wins,
            uint256 losses,
            uint256 shares,
            uint256 currentBossRound,
            uint256 slain
        )
    {
        return (
            streak[player],
            longestStreak[player],
            getMultiplier(player),
            totalWins[player],
            totalLosses[player],
            totalShares[player],
            bossRound[player],
            bossesSlain[player]
        );
    }

    function entrantCount(bytes32 marketId) external view returns (uint256) {
        return entrants[marketId].length;
    }

    function pendingResolves(bytes32 marketId) external view returns (uint256) {
        return entrants[marketId].length - resolveCursor[marketId];
    }
}
