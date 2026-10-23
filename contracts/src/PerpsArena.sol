// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {ISomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaEventHandler.sol";
import {ISomniaReactivityPrecompile} from "@somnia-chain/reactivity-contracts/contracts/interfaces/ISomniaReactivityPrecompile.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// The two dreamDEX MarginBank reads the arena needs. Signatures match the
/// deployed bank and the SDK's marginBankReadAbi.
interface IMarginBank {
    struct Position {
        int128 size;
        uint128 avgEntryPrice;
        int256 entryFundingIndex;
        uint64 lastUpdatedTimestampNs;
    }

    function getPosition(address account, address perpPool) external view returns (Position memory);
    function isPerpPoolRegistered(address perpPool) external view returns (bool);
}

/// `isOperatorAuthorized` is the same check a PerpPool runs before accepting
/// `placeOrderFor` from a linked bot. Only asked of pools the bank registered.
interface IPerpPool {
    function isOperatorAuthorized(address owner, address operator, bytes4 selector) external view returns (bool);
}

/**
 * @title PerpsArena
 * @notice Leverage challenges scored by the chain. Players trade real dreamDEX
 *         perps; this contract holds no trading funds and places no orders. It
 *         subscribes to the player's own MarginBank events through Somnia
 *         Reactivity, and the precompile calls `onEvent` in the block the
 *         position changes. No keeper, no backend.
 *
 * @dev Games:
 *      - Survivor: start with an open position and keep it open until the
 *        deadline. A liquidation or a full close first loses. A scheduled
 *        Reactivity callback at the deadline settles the win.
 *      - Streak: start flat. Every round trip that closes in profit adds a win;
 *        the first losing close or a liquidation ends the run.
 *      - Boss: a Streak that is won outright at BOSS_ROUNDS profitable closes.
 *
 *      A trade's result is the sum of `realizedPnl` over its PositionUpdated
 *      events, from open to flat. On dreamDEX each event carries only the PnL
 *      of that change (verified on testnet), and it excludes trading fees.
 *
 *      One run per player, with its own subscriptions filtered to the player
 *      and the pool, so the arena only pays for callbacks on players in a run.
 *      MarginBank emits about 9,800 PositionUpdated an hour across all traders,
 *      which rules out one unfiltered subscription.
 */
contract PerpsArena is SomniaEventHandler, Ownable {
    // -------------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------------

    address public constant PRECOMPILE = address(0x0100);
    /// The precompile refuses to open a subscription for an owner holding less.
    uint256 public constant SUBSCRIPTION_OWNER_MINIMUM_BALANCE = 32 ether;
    uint64 public constant MAX_FEE_PER_GAS = 20 gwei;
    uint64 public constant MAX_CALLBACK_GAS_LIMIT = 200_000_000;

    bytes32 public constant POSITION_UPDATED_SIG =
        keccak256("PositionUpdated(address,address,int128,uint128,int256,int256)");
    bytes32 public constant POSITION_LIQUIDATED_SIG = keccak256("PositionLiquidated(address,address,int128,uint256)");
    bytes32 public constant SCHEDULE_SIG = keccak256("Schedule(uint256)");
    bytes4 public constant PLACE_ORDER_FOR =
        bytes4(keccak256("placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)"));

    uint32 public constant BOSS_ROUNDS = 3;
    uint64 public constant MIN_SURVIVAL = 5 minutes;
    uint64 public constant MAX_SURVIVAL = 24 hours;
    /// How many seconds before the firing time a Schedule callback looks back
    /// for a due deadline, in case delivery runs late.
    uint256 public constant SCHEDULE_LOOKBACK = 10;

    address public immutable marginBank;

    /// Gas each callback may use; it is billed on use, not on this limit.
    /// Somnia prices storage writes far above Ethereum: a run's first callback
    /// measured 1.43M gas on Hideki, and a 1.5M limit ran out with the
    /// injected transaction's overhead. Ending a run also unsubscribes inside
    /// the callback. dreamDEX's own handlers run with 50M to 100M.
    uint64 public callbackGasLimit = 10_000_000;
    bool public paused;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    enum Game {
        None,
        Survivor,
        Streak,
        Boss
    }

    enum Status {
        None,
        Active,
        Won,
        Lost,
        Ended
    }

    uint256 private constant SUB_UPDATED = 0;
    uint256 private constant SUB_LIQUIDATED = 1;
    uint256 private constant SUB_SCHEDULE = 2;

    struct Run {
        Game game;
        Status status;
        address pool;
        uint64 startedAt;
        /// Survivor only: unix seconds the position must survive to.
        uint64 deadline;
        /// Profitable closes in this run.
        uint32 wins;
        /// Position size after the last event, to spot a close or a flip.
        int128 lastSize;
        /// Realized PnL of the trade in progress (18 decimals, USDso).
        int256 tradePnl;
        /// Realized PnL across the run.
        int256 runPnl;
        /// Live subscription ids: PositionUpdated, PositionLiquidated, Schedule.
        uint256[3] subs;
    }

    struct Stats {
        uint32 runs;
        uint32 survived;
        uint32 bestStreak;
        uint32 bossesSlain;
        uint32 liquidations;
        uint32 closedTrades;
        uint32 winningTrades;
        int256 realizedPnl;
    }

    mapping(address => Run) private _runs;
    mapping(address => Stats) public stats;
    /// Schedule callbacks carry only a timestamp, and it is the block's actual
    /// time in milliseconds, not the one requested: on Hideki a schedule set for
    /// ...992000 arrived as ...992012. So each Survivor deadline gets its own
    /// whole second, keyed here in seconds, and the callback matches by second.
    mapping(uint256 => address) public scheduledPlayer;

    /// Every player who has started a run, in order, so a leaderboard reads
    /// state instead of scanning logs (Hideki makes 36,000 blocks an hour and
    /// its RPC serves logs 1,000 blocks at a time).
    address[] private _players;

    uint256 public activeRuns;
    uint256 public callbacks;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event RunStarted(address indexed player, Game game, address indexed pool, uint64 deadline, address startedBy);
    event TradeScored(address indexed player, int256 pnl, bool won, uint32 wins);
    event RunFinished(address indexed player, Game game, Status status, uint32 wins, int256 runPnl);
    event Liquidated(address indexed player, address indexed pool);
    /// Every callback the arena acts on, for the app's live Reactivity monitor.
    event Reacted(address indexed player, bytes32 indexed eventSig, uint256 blockNumber);
    event UnsubscribeFailed(address indexed player, uint256 subscriptionId);
    event PausedSet(bool paused);
    event CallbackGasLimitSet(uint64 gasLimit);

    error Paused();
    error InvalidGame();
    error InvalidPool();
    error RunActive();
    error NoActiveRun();
    error NotAuthorized();
    error NeedOpenPosition();
    error NeedFlatPosition();
    error SurvivalOutOfRange();
    error ArenaUnfunded();
    error TooEarly();
    error GasLimitOutOfRange();
    /// A finished run still holds a subscription; a new one would double-count.
    error StaleSubscription();

    constructor(address _marginBank) Ownable(msg.sender) {
        marginBank = _marginBank;
    }

    /// Callbacks are paid from this balance; send STT here to fund the arena.
    receive() external payable {}

    // -------------------------------------------------------------------------
    // Runs
    // -------------------------------------------------------------------------

    /// Start a run for the caller's own perps account.
    function startRun(Game game, address pool, uint64 survivalSeconds) external {
        _start(msg.sender, game, pool, survivalSeconds);
    }

    /// Start a run for a player whose wallet linked the caller as a bot on this
    /// pool (dreamDEX Link a Bot). The pool's own operator check is the gate.
    function startRunFor(address player, Game game, address pool, uint64 survivalSeconds) external {
        if (!_isOperator(player, pool, msg.sender)) revert NotAuthorized();
        _start(player, game, pool, survivalSeconds);
    }

    /// The player, or their linked bot, ends a run early. Streak wins so far are kept.
    function endRun(address player) external {
        Run storage run = _runs[player];
        if (run.status != Status.Active) revert NoActiveRun();
        if (msg.sender != player && !_isOperator(player, run.pool, msg.sender)) revert NotAuthorized();
        _finish(player, run, Status.Ended);
    }

    /**
     * @notice Settle a Survivor run whose deadline passed without its scheduled
     *         callback landing. Permissionless: the outcome is read from chain.
     */
    function finishSurvivor(address player) external {
        Run storage run = _runs[player];
        if (run.status != Status.Active || run.game != Game.Survivor) revert NoActiveRun();
        if (block.timestamp < run.deadline) revert TooEarly();
        _settleSurvivor(player, run);
    }

    /// Retry unsubscribing a finished run whose cleanup failed inside a callback. Permissionless.
    function cleanup(address player) external {
        Run storage run = _runs[player];
        if (run.status == Status.Active) revert RunActive();
        _unsubscribeAll(player, run);
    }

    function _start(address player, Game game, address pool, uint64 survivalSeconds) internal {
        if (paused) revert Paused();
        if (game == Game.None) revert InvalidGame();
        if (!_isPerpPool(pool)) revert InvalidPool();

        Run storage previous = _runs[player];
        if (previous.status == Status.Active) revert RunActive();
        // Anything a failed cleanup left behind must go first: a live old
        // subscription beside a new one would deliver every event twice.
        _unsubscribeAll(player, previous);
        if (previous.subs[SUB_UPDATED] != 0 || previous.subs[SUB_LIQUIDATED] != 0 || previous.subs[SUB_SCHEDULE] != 0) {
            revert StaleSubscription();
        }

        int128 size = IMarginBank(marginBank).getPosition(player, pool).size;
        uint64 deadline;
        if (game == Game.Survivor) {
            if (size == 0) revert NeedOpenPosition();
            if (survivalSeconds < MIN_SURVIVAL || survivalSeconds > MAX_SURVIVAL) revert SurvivalOutOfRange();
            deadline = uint64(block.timestamp) + survivalSeconds;
            // One player per second, so a Schedule callback maps to one run.
            while (scheduledPlayer[deadline] != address(0)) deadline++;
        } else if (size != 0) {
            // A trade opened before the run would carry PnL from outside it.
            revert NeedFlatPosition();
        }

        if (address(this).balance < SUBSCRIPTION_OWNER_MINIMUM_BALANCE) revert ArenaUnfunded();

        delete _runs[player];
        Run storage run = _runs[player];
        run.game = game;
        run.status = Status.Active;
        run.pool = pool;
        run.startedAt = uint64(block.timestamp);
        run.deadline = deadline;
        run.lastSize = size;

        bytes32 account = bytes32(uint256(uint160(player)));
        bytes32 poolTopic = bytes32(uint256(uint160(pool)));
        run.subs[SUB_UPDATED] = _subscribe([POSITION_UPDATED_SIG, account, poolTopic, bytes32(0)], marginBank);
        run.subs[SUB_LIQUIDATED] = _subscribe([POSITION_LIQUIDATED_SIG, account, poolTopic, bytes32(0)], marginBank);
        if (game == Game.Survivor) {
            scheduledPlayer[deadline] = player;
            run.subs[SUB_SCHEDULE] =
                _subscribe([SCHEDULE_SIG, bytes32(uint256(deadline) * 1000), bytes32(0), bytes32(0)], PRECOMPILE);
        }

        if (stats[player].runs == 0) _players.push(player);
        stats[player].runs++;
        activeRuns++;
        emit RunStarted(player, game, pool, deadline, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Reactive scoring
    // -------------------------------------------------------------------------

    /**
     * @dev `SomniaEventHandler.onEvent` has already proven the caller is the
     *      precompile. The emitter, topic and run are still checked, so a stale
     *      subscription or a widened filter can never move a score.
     */
    function _onEvent(address emitter, bytes32[] calldata eventTopics, bytes calldata data) internal override {
        callbacks++;
        if (eventTopics.length < 2) return;

        if (emitter == PRECOMPILE && eventTopics[0] == SCHEDULE_SIG) {
            // The firing second first, then earlier ones for a late delivery.
            // Only deadlines at or before the firing time can match.
            uint256 firedAt = uint256(eventTopics[1]) / 1000;
            for (uint256 back = 0; back <= SCHEDULE_LOOKBACK && back <= firedAt; back++) {
                address scheduled = scheduledPlayer[firedAt - back];
                if (scheduled == address(0)) continue;
                delete scheduledPlayer[firedAt - back];
                Run storage due = _runs[scheduled];
                due.subs[SUB_SCHEDULE] = 0; // a schedule fires once
                if (due.status == Status.Active && due.game == Game.Survivor) {
                    emit Reacted(scheduled, SCHEDULE_SIG, block.number);
                    _settleSurvivor(scheduled, due);
                }
                return;
            }
            return;
        }

        if (emitter != marginBank || eventTopics.length < 3) return;
        address player = address(uint160(uint256(eventTopics[1])));
        address pool = address(uint160(uint256(eventTopics[2])));
        Run storage run = _runs[player];
        if (run.status != Status.Active || run.pool != pool) return;

        if (eventTopics[0] == POSITION_LIQUIDATED_SIG) {
            emit Reacted(player, POSITION_LIQUIDATED_SIG, block.number);
            stats[player].liquidations++;
            emit Liquidated(player, pool);
            _finish(player, run, Status.Lost);
        } else if (eventTopics[0] == POSITION_UPDATED_SIG) {
            emit Reacted(player, POSITION_UPDATED_SIG, block.number);
            (int128 newSize,, int256 realizedPnl,) = abi.decode(data, (int128, uint128, int256, int256));
            _onPositionUpdated(player, run, newSize, realizedPnl);
        }
    }

    function _onPositionUpdated(address player, Run storage run, int128 newSize, int256 realizedPnl) internal {
        int128 previous = run.lastSize;
        run.lastSize = newSize;
        run.tradePnl += realizedPnl;
        run.runPnl += realizedPnl;
        stats[player].realizedPnl += realizedPnl;

        if (run.game == Game.Survivor) {
            // Closing before the deadline forfeits; resizing or flipping does not.
            if (newSize == 0) _finish(player, run, Status.Lost);
            return;
        }

        // A trade closes when the position goes flat or flips side. A flip's
        // realized PnL belongs to the trade it closed.
        bool closed = previous != 0 && (newSize == 0 || (previous > 0) != (newSize > 0));
        if (!closed) return;

        int256 pnl = run.tradePnl;
        run.tradePnl = 0;
        Stats storage s = stats[player];
        s.closedTrades++;

        if (pnl > 0) {
            s.winningTrades++;
            run.wins++;
            if (run.wins > s.bestStreak) s.bestStreak = run.wins;
            emit TradeScored(player, pnl, true, run.wins);
            if (run.game == Game.Boss && run.wins >= BOSS_ROUNDS) {
                s.bossesSlain++;
                _finish(player, run, Status.Won);
            }
        } else {
            emit TradeScored(player, pnl, false, run.wins);
            _finish(player, run, Status.Lost);
        }
    }

    function _settleSurvivor(address player, Run storage run) internal {
        int128 size = IMarginBank(marginBank).getPosition(player, run.pool).size;
        if (size != 0) {
            stats[player].survived++;
            _finish(player, run, Status.Won);
        } else {
            _finish(player, run, Status.Lost);
        }
    }

    function _finish(address player, Run storage run, Status status) internal {
        run.status = status;
        activeRuns--;
        // Free this player's deadline second if it has not fired yet.
        if (run.game == Game.Survivor && scheduledPlayer[run.deadline] == player) delete scheduledPlayer[run.deadline];
        emit RunFinished(player, run.game, status, run.wins, run.runPnl);
        _unsubscribeAll(player, run);
    }

    // -------------------------------------------------------------------------
    // Subscriptions
    // -------------------------------------------------------------------------

    function _subscribe(bytes32[4] memory topics, address emitter) internal returns (uint256) {
        ISomniaReactivityPrecompile.SubscriptionData memory data = ISomniaReactivityPrecompile.SubscriptionData({
            eventTopics: topics,
            origin: address(0),
            caller: address(0),
            emitter: emitter,
            handlerContractAddress: address(this),
            handlerFunctionSelector: ISomniaEventHandler.onEvent.selector,
            priorityFeePerGas: 0,
            maxFeePerGas: MAX_FEE_PER_GAS,
            gasLimit: callbackGasLimit,
            // A dropped callback is a lost trade, so delivery moves to the next
            // block when one is full. Coalescing would merge trades; it stays off.
            isGuaranteed: true,
            isCoalesced: false
        });
        return ISomniaReactivityPrecompile(PRECOMPILE).subscribe(data);
    }

    /// Never reverts: a run must finish even when an unsubscribe does not.
    function _unsubscribeAll(address player, Run storage run) internal {
        for (uint256 i = 0; i < 3; i++) {
            uint256 id = run.subs[i];
            if (id == 0) continue;
            (bool ok,) = PRECOMPILE.call(abi.encodeCall(ISomniaReactivityPrecompile.unsubscribe, (id)));
            if (ok) run.subs[i] = 0;
            else emit UnsubscribeFailed(player, id);
        }
    }

    // -------------------------------------------------------------------------
    // Reads
    // -------------------------------------------------------------------------

    function getRun(address player) external view returns (Run memory) {
        return _runs[player];
    }

    function playerCount() external view returns (uint256) {
        return _players.length;
    }

    /// A page of players in join order; `limit` is clamped to what remains.
    function getPlayers(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _players.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) page[i - offset] = _players[i];
    }

    /// Only pools the MarginBank itself registered count; a contract claiming
    /// to be a pool could otherwise vouch for its own operators.
    function _isPerpPool(address pool) internal view returns (bool) {
        return pool != address(0) && IMarginBank(marginBank).isPerpPoolRegistered(pool);
    }

    function _isOperator(address player, address pool, address operator) internal view returns (bool) {
        if (!_isPerpPool(pool)) return false;
        try IPerpPool(pool).isOperatorAuthorized(player, operator, PLACE_ORDER_FOR) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    // -------------------------------------------------------------------------
    // Admin: funding and safety only. The owner cannot touch a score.
    // -------------------------------------------------------------------------

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    /// Applies to subscriptions opened after the change.
    function setCallbackGasLimit(uint64 gasLimit) external onlyOwner {
        if (gasLimit < 200_000 || gasLimit > MAX_CALLBACK_GAS_LIMIT) revert GasLimitOutOfRange();
        callbackGasLimit = gasLimit;
        emit CallbackGasLimitSet(gasLimit);
    }

    function withdrawNative(address payable to, uint256 amount) external onlyOwner {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
