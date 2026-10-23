import 'server-only';

import { decodeEventLog, getAddress, keccak256, multicall3Abi, toHex, type Address, type Hex, type Log } from 'viem';
import { PERPS_ARENA_ABI } from '@/lib/abis';
import { GAMES, type ArenaView, type FeedEvent, type FeedView, type GameName, type LeaderRow, type PlayerView, type RunStatus } from '@/lib/types';
import { listMarkets } from '../../../mcp-server/src/perps';
import { ARENA, MARGIN_BANK, publicClient } from './chain';
import deployment from '../../../contracts/deployments/50383.json';

const STATUSES: RunStatus[] = ['None', 'Active', 'Won', 'Lost', 'Ended'];
const usd = (raw: bigint) => Number(raw) / 1e18;
const game = (n: number): GameName | null => (n >= 1 && n <= 3 ? GAMES[n - 1] : null);

const SIG = {
  updated: keccak256(toHex('PositionUpdated(address,address,int128,uint128,int256,int256)')),
  liquidated: keccak256(toHex('PositionLiquidated(address,address,int128,uint256)')),
  schedule: keccak256(toHex('Schedule(uint256)')),
};

/** Pool address to market symbol, from the perps market list. */
async function symbols(): Promise<Map<string, string>> {
  const markets = await listMarkets();
  return new Map(markets.map((m) => [m.pool.toLowerCase(), m.symbol]));
}

type RawRun = {
  game: number;
  status: number;
  pool: Address;
  startedAt: bigint;
  deadline: bigint;
  wins: number;
  lastSize: bigint;
  tradePnl: bigint;
  runPnl: bigint;
};
type RawStats = readonly [number, number, number, number, number, number, number, bigint];

function toPlayer(address: Address, run: RawRun, stats: RawStats, names: Map<string, string>): PlayerView {
  const active = run.pool !== '0x0000000000000000000000000000000000000000';
  return {
    address,
    run: {
      game: game(run.game),
      status: STATUSES[run.status] ?? 'None',
      pool: active ? run.pool : null,
      symbol: active ? (names.get(run.pool.toLowerCase()) ?? null) : null,
      startedAt: Number(run.startedAt),
      deadline: Number(run.deadline),
      wins: run.wins,
      lastSize: run.lastSize.toString(),
      tradePnl: usd(run.tradePnl),
      runPnl: usd(run.runPnl),
    },
    stats: {
      runs: stats[0],
      survived: stats[1],
      bestStreak: stats[2],
      bossesSlain: stats[3],
      liquidations: stats[4],
      closedTrades: stats[5],
      winningTrades: stats[6],
      realizedPnl: usd(stats[7]),
    },
  };
}

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * Arena state and, optionally, one player's run and stats, in one Multicall3
 * request. The app polls this every few seconds, and this RPC answers each
 * call in hundreds of milliseconds, so separate reads added up to seconds.
 */
export async function getArenaAndPlayer(player: Address | null): Promise<{ arena: ArenaView; player: PlayerView | null }> {
  const arenaCall = <F extends 'callbacks' | 'activeRuns' | 'playerCount' | 'paused' | 'SUBSCRIPTION_OWNER_MINIMUM_BALANCE'>(functionName: F) =>
    ({ address: ARENA, abi: PERPS_ARENA_ABI, functionName }) as const;
  const [[balance, callbacks, activeRuns, playerCount, paused, minimum, run, stats], head, names] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      contracts: [
        { address: MULTICALL3, abi: multicall3Abi, functionName: 'getEthBalance', args: [ARENA] },
        arenaCall('callbacks'),
        arenaCall('activeRuns'),
        arenaCall('playerCount'),
        arenaCall('paused'),
        arenaCall('SUBSCRIPTION_OWNER_MINIMUM_BALANCE'),
        // Without a player this reads the arena's own empty slot, and the result is dropped below.
        { address: ARENA, abi: PERPS_ARENA_ABI, functionName: 'getRun', args: [player ?? ARENA] },
        { address: ARENA, abi: PERPS_ARENA_ABI, functionName: 'stats', args: [player ?? ARENA] },
      ],
    }),
    publicClient.getBlockNumber(),
    player ? symbols() : Promise.resolve(new Map<string, string>()),
  ]);
  return {
    arena: {
      address: ARENA,
      balanceStt: usd(balance),
      minimumStt: usd(minimum),
      callbacks: Number(callbacks),
      activeRuns: Number(activeRuns),
      playerCount: Number(playerCount),
      paused,
      head: Number(head),
    },
    player: player ? toPlayer(player, run as RawRun, stats as RawStats, names) : null,
  };
}

export async function getLeaderboard(limit = 200): Promise<LeaderRow[]> {
  const players = await publicClient.readContract({
    address: ARENA,
    abi: PERPS_ARENA_ABI,
    functionName: 'getPlayers',
    args: [0n, BigInt(limit)],
  });
  if (players.length === 0) return [];
  const [results, names] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      contracts: players.flatMap((p) => [
        { address: ARENA, abi: PERPS_ARENA_ABI, functionName: 'getRun', args: [p] } as const,
        { address: ARENA, abi: PERPS_ARENA_ABI, functionName: 'stats', args: [p] } as const,
      ]),
    }),
    symbols(),
  ]);
  return players.map((p, i) => {
    const view = toPlayer(p, results[i * 2] as RawRun, results[i * 2 + 1] as RawStats, names);
    const { closedTrades, winningTrades } = view.stats;
    return { ...view, winRate: closedTrades > 0 ? winningTrades / closedTrades : null };
  });
}

// ---------------------------------------------------------------------------
// Live feed: the arena's own events over a rolling window, kept in memory and
// extended incrementally. Hideki makes ten blocks a second and serves logs
// 1,000 blocks per request, so a cold start reads at most WINDOW blocks.
// ---------------------------------------------------------------------------

const WINDOW = 36_000n; // about an hour
const CHUNK = 1_000n;
const KEEP = 300;

const cache: { from: bigint; to: bigint; events: FeedEvent[]; deadlines: Map<string, number> } = {
  from: 0n,
  to: 0n,
  events: [],
  deadlines: new Map(),
};
let deployBlock: bigint | null = null;
let inflight: Promise<FeedView> | null = null;
const blockTimes = new Map<bigint, number>();

async function blockTime(block: bigint): Promise<number> {
  const hit = blockTimes.get(block);
  if (hit !== undefined) return hit;
  const b = await publicClient.getBlock({ blockNumber: block });
  const ms = Number(b.timestamp) * 1000;
  blockTimes.set(block, ms);
  if (blockTimes.size > 2000) blockTimes.delete(blockTimes.keys().next().value as bigint);
  return ms;
}

async function arenaDeployBlock(): Promise<bigint> {
  if (deployBlock !== null) return deployBlock;
  const receipt = await publicClient.getTransactionReceipt({ hash: deployment.transactions.deploy as Hex });
  deployBlock = receipt.blockNumber;
  return deployBlock;
}

async function logsBetween(from: bigint, to: bigint): Promise<Log[]> {
  const ranges: [bigint, bigint][] = [];
  for (let start = from; start <= to; start += CHUNK) ranges.push([start, start + CHUNK - 1n > to ? to : start + CHUNK - 1n]);
  const out: Log[] = [];
  for (let i = 0; i < ranges.length; i += 12) {
    const batch = await Promise.all(
      ranges.slice(i, i + 12).map(([fromBlock, toBlock]) => publicClient.getLogs({ address: ARENA, fromBlock, toBlock })),
    );
    for (const logs of batch) out.push(...logs);
  }
  return out;
}

/** The trade whose MarginBank log fired a position callback, found in the callback's own block. */
async function findOrderTx(player: string, block: bigint, sig: Hex): Promise<string | null> {
  const logs = await publicClient.getLogs({
    address: MARGIN_BANK,
    fromBlock: block,
    toBlock: block,
    // viem's typed topics want an event; the raw filter is what is needed here.
    topics: [sig, `0x${player.slice(2).toLowerCase().padStart(64, '0')}` as Hex],
  } as unknown as Parameters<typeof publicClient.getLogs>[0]);
  return logs[0]?.transactionHash ?? null;
}

async function toEvents(logs: Log[], names: Map<string, string>): Promise<FeedEvent[]> {
  const events: FeedEvent[] = [];
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: PERPS_ARENA_ABI, data: log.data, topics: log.topics });
    } catch {
      continue; // an event this feed does not show
    }
    const block = log.blockNumber as bigint;
    const base = {
      id: `${log.transactionHash}:${log.logIndex}`,
      block: Number(block),
      time: await blockTime(block),
      tx: log.transactionHash as string,
    };
    const args = decoded.args as Record<string, unknown>;
    const player = typeof args.player === 'string' ? getAddress(args.player) : '';
    switch (decoded.eventName) {
      case 'RunStarted': {
        const deadline = Number(args.deadline as bigint);
        if (deadline > 0) cache.deadlines.set(player, deadline);
        events.push({ ...base, kind: 'RunStarted', player, game: game(Number(args.game)) ?? undefined, symbol: names.get(String(args.pool).toLowerCase()) ?? null });
        break;
      }
      case 'Reacted': {
        const sig = args.eventSig as Hex;
        const source = sig === SIG.schedule ? 'Schedule' : sig === SIG.liquidated ? 'PositionLiquidated' : 'PositionUpdated';
        if (source === 'Schedule') {
          const deadline = cache.deadlines.get(player);
          events.push({
            ...base,
            kind: 'Reacted',
            player,
            trigger: {
              source,
              orderTx: null,
              sameBlock: true,
              lateBySeconds: deadline !== undefined ? Math.round(base.time / 1000 - deadline) : undefined,
            },
          });
        } else {
          const orderTx = await findOrderTx(player, block, source === 'PositionLiquidated' ? SIG.liquidated : SIG.updated);
          events.push({ ...base, kind: 'Reacted', player, trigger: { source, orderTx, sameBlock: orderTx !== null } });
        }
        break;
      }
      case 'TradeScored':
        events.push({ ...base, kind: 'TradeScored', player, pnl: usd(args.pnl as bigint), won: Boolean(args.won), wins: Number(args.wins) });
        break;
      case 'RunFinished':
        events.push({
          ...base,
          kind: 'RunFinished',
          player,
          game: game(Number(args.game)) ?? undefined,
          status: STATUSES[Number(args.status)] ?? 'None',
          wins: Number(args.wins),
          pnl: usd(args.runPnl as bigint),
        });
        break;
      case 'Liquidated':
        events.push({ ...base, kind: 'Liquidated', player, symbol: names.get(String(args.pool).toLowerCase()) ?? null });
        break;
    }
  }
  return events;
}

async function refreshFeed(): Promise<FeedView> {
  const head = await publicClient.getBlockNumber();
  const floor = await arenaDeployBlock();
  const from = cache.to > 0n ? cache.to + 1n : head - WINDOW > floor ? head - WINDOW : floor;
  if (cache.from === 0n) cache.from = from;
  if (from <= head) {
    const [logs, names] = await Promise.all([logsBetween(from, head), symbols()]);
    const fresh = await toEvents(logs, names);
    cache.events = [...fresh.reverse(), ...cache.events].slice(0, KEEP);
    cache.to = head;
  }
  return { events: cache.events, fromBlock: Number(cache.from), head: Number(head) };
}

/** Concurrent callers share one refresh. */
export function getFeed(): Promise<FeedView> {
  inflight ??= refreshFeed().finally(() => {
    inflight = null;
  });
  return inflight;
}
