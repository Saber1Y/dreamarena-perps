// The chain layer the MCP tools sit on.
//
// This mirrors the frontend's lib/dreamdex.ts deliberately: same SDK, same
// client tier, same order sizing. An agent and a player should be looking at
// the same book and getting the same quote.

import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  ORDER_TYPE,
  quoteBinaryStakeOverBook,
} from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';
import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const DECIMALS = 6;
export const UNIT = 1_000_000n;
export const toHuman = (raw: bigint) => Number(raw) / Number(UNIT);
export const toRaw = (human: number) => BigInt(Math.round(human * Number(UNIT)));

export const EXPLORER = 'https://shannon-explorer.somnia.network';

export const config = {
  indexerUrl: process.env.SOMNIA_INDEXER ?? 'https://dev.smk.somnia.host/v1/graphql',
  wsRpcUrl: process.env.SOMNIA_WS ?? 'wss://api.infra.testnet.somnia.network/ws',
  rpcUrl: process.env.SOMNIA_RPC ?? 'https://dream-rpc.somnia.network',
  arcadeEngine: (process.env.ARCADE_ENGINE ?? process.env.NEXT_PUBLIC_ARCADE_ENGINE ?? '') as Address,
  daoFactory: (process.env.DAO_FACTORY ?? process.env.NEXT_PUBLIC_DAO_FACTORY ?? '') as Address,
  privateKey: process.env.PRIVATE_KEY as Hex | undefined,
  /**
   * Hard ceiling on a single agent-placed bet, in tUSDC. An agent with a key
   * needs a bound it cannot talk itself past, so this is enforced here rather
   * than left to the prompt.
   */
  maxBetTusdc: Number(process.env.MAX_BET_TUSDC ?? '25'),
};

const exchange = new SomniaMarkets({
  indexerUrl: config.indexerUrl,
  chain: somniaShannon,
  wsRpcUrl: config.wsRpcUrl,
  addresses: SOMNIA_TESTNET_ADDRESSES,
  priceFeed: SOMNIA_TESTNET_PRICE_FEED,
});

export const client = exchange.client;
export const closeExchange = () => exchange.close();

export const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(config.rpcUrl),
});

export const account = config.privateKey ? privateKeyToAccount(config.privateKey) : null;

export interface ArenaMarket {
  marketId: Hex;
  pool: Address;
  asset: string;
  question: string;
  strike: number | null;
  expiry: number;
  intervalSec: number;
  secondsLeft: number;
}

/**
 * The row's `strike` is raw in the ORACLE's price scale — a per-series property
 * that never reaches the row, so scaling it by the collateral unit is wrong by
 * orders of magnitude. The question text carries the human number verbatim.
 */
function humanStrike(row: any): number | null {
  if (!row?.strike || Number(row.strike) === 0) return null;
  const m = String(row.question ?? '').match(/at or above\s+([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

function toArenaMarket(row: any, now: number): ArenaMarket {
  return {
    marketId: row.marketId as Hex,
    pool: row.poolAddress as Address,
    asset: row.asset ?? '?',
    question: row.question ?? '',
    strike: humanStrike(row),
    expiry: Number(row.expiry ?? 0),
    intervalSec: Number(row.intervalSec ?? 0),
    secondsLeft: Math.max(0, Number(row.expiry ?? 0) - now),
  };
}

export async function listMarkets(limit = 20): Promise<ArenaMarket[]> {
  const rows = await client.listLiveBinaryMarkets({ limit, status: 'Trading' });
  const now = Math.floor(Date.now() / 1000);
  return rows.map((r: any) => toArenaMarket(r, now)).filter((m) => m.secondsLeft > 0);
}

export async function findMarket(ref: string): Promise<ArenaMarket | null> {
  const now = Math.floor(Date.now() / 1000);
  if (ref.startsWith('0x')) {
    const row = await client.getBinaryMarket(ref);
    return row ? toArenaMarket(row, now) : null;
  }
  // Otherwise treat it as an asset symbol and take the soonest to resolve.
  const markets = await listMarkets(24);
  return markets.find((m) => m.asset.toLowerCase() === ref.toLowerCase()) ?? null;
}

export interface SideQuote {
  side: 'UP' | 'DOWN';
  /** Best ask, 0..1 — the market's implied probability for this side. */
  price: number | null;
  /** What 1 tUSDC returns if this side wins. */
  payoutMultiple: number | null;
}

export async function getQuotes(market: ArenaMarket): Promise<{ up: SideQuote; down: SideQuote }> {
  const book: any = await client.getBinaryOrderBook(market.pool, { depth: 5, decimals: DECIMALS });
  const best = (levels: any[]) =>
    levels?.[0] ? Number(levels[0].price) / Number(UNIT) : null;

  const mk = (side: 'UP' | 'DOWN', price: number | null): SideQuote => ({
    side,
    price,
    payoutMultiple: price && price > 0 ? 1 / price : null,
  });

  return { up: mk('UP', best(book.yesAsks)), down: mk('DOWN', best(book.noAsks)) };
}

export interface RiskAssessment {
  riskScore: number;
  secondsToExpiry: number;
  spreadBps: number | null;
  impliedProbability: number | null;
  recommendation: string;
}

/**
 * Risk from what the market actually shows: how close expiry is, how wide the
 * book is, and how far the odds sit from a coin flip. No synthetic volatility
 * number — a made-up input produces a made-up score.
 */
export async function assessRisk(market: ArenaMarket, up: boolean): Promise<RiskAssessment> {
  const book: any = await client.getBinaryOrderBook(market.pool, { depth: 5, decimals: DECIMALS });
  const asks = up ? book.yesAsks : book.noAsks;
  const bids = up ? book.yesBids : book.noBids;

  const ask = asks?.[0] ? Number(asks[0].price) / Number(UNIT) : null;
  const bid = bids?.[0] ? Number(bids[0].price) / Number(UNIT) : null;
  const spreadBps = ask !== null && bid !== null ? Math.round((ask - bid) * 10_000) : null;

  let score = 5;
  if (market.secondsLeft < 20) score += 3;
  else if (market.secondsLeft < 60) score += 1;
  if (spreadBps !== null && spreadBps > 500) score += 2;
  if (ask !== null && ask > 0.85) score += 1; // paying up for a near-certainty
  if (ask !== null && ask < 0.2) score += 2; // long shot
  if (ask !== null && ask >= 0.4 && ask <= 0.6) score -= 1;
  score = Math.min(10, Math.max(1, score));

  return {
    riskScore: score,
    secondsToExpiry: market.secondsLeft,
    spreadBps,
    impliedProbability: ask,
    recommendation:
      ask === null
        ? 'No offer on this side — the order would not fill.'
        : score >= 8
          ? 'High risk: expiring very soon or priced at an extreme. Size down.'
          : score <= 4
            ? 'Balanced odds and a workable spread.'
            : 'Moderate risk: standard sizing.',
  };
}

const RECORD_ENTRY_ABI = [
  {
    type: 'function',
    name: 'recordEntry',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'up', type: 'bool' },
      { name: 'shares', type: 'uint256' },
      { name: 'gameType', type: 'uint8' },
    ],
    outputs: [],
  },
] as const;

export interface BetOutcome {
  txHash: string;
  explorer: string;
  shares: number;
  avgPrice: number;
  cost: number;
  recorded: boolean;
  note?: string;
}

/**
 * Place a real order on the market's book, then record the entry with
 * ArcadeEngine so the reactive settlement can move the streak.
 */
export async function placeBet(
  market: ArenaMarket,
  up: boolean,
  stakeTusdc: number,
): Promise<BetOutcome> {
  if (!account) throw new Error('No PRIVATE_KEY configured — this server is read-only.');
  if (stakeTusdc <= 0) throw new Error('Stake must be greater than zero.');
  if (stakeTusdc > config.maxBetTusdc) {
    throw new Error(
      `Stake ${stakeTusdc} tUSDC exceeds this server's per-bet cap of ${config.maxBetTusdc} tUSDC.`,
    );
  }
  if (market.secondsLeft <= 5) {
    throw new Error('That market is about to expire — the order would not land in time.');
  }

  const [book, grid] = await Promise.all([
    client.getBinaryOrderBook(market.pool, { depth: 10, decimals: DECIMALS }),
    client.getBinaryBookParams(market.pool),
  ]);

  const side = up ? 'BUY_YES' : 'BUY_NO';
  const quote = quoteBinaryStakeOverBook(book, side, toRaw(stakeTusdc), UNIT, {
    tickSize: grid.tickSize,
    lotSize: grid.lotSize,
  });
  if (!quote) {
    throw new Error(
      `Nothing is offered on ${up ? 'UP' : 'DOWN'} for this market, or the stake is below one lot.`,
    );
  }

  const trader = client.createTrader({ privateKey: config.privateKey });
  const result: any = await trader.placeOrder({
    pool: market.pool,
    side,
    price: quote.yesPrice,
    quantity: quote.quantity,
    orderType: ORDER_TYPE.MARKET,
  });

  const fills: Array<{ quantityFilled: bigint; fillPrice: bigint }> = result.fills ?? [];
  const filled = fills.reduce((sum, f) => sum + BigInt(f.quantityFilled), 0n);
  if (filled === 0n) throw new Error('The order did not fill — the book moved before it landed.');

  // Fill prices come back in YES terms, so a DOWN fill has to be mirrored back
  // into its own side before it can be averaged.
  const notional = fills.reduce((sum, f) => {
    const price = up ? BigInt(f.fillPrice) : UNIT - BigInt(f.fillPrice);
    return sum + BigInt(f.quantityFilled) * price;
  }, 0n);
  const avgPrice = Number(notional) / Number(filled) / Number(UNIT);

  // The order already filled. If the arcade leg fails the position is still
  // real and still redeems, so report that plainly rather than implying loss.
  let recorded = false;
  let note: string | undefined;
  if (!config.arcadeEngine) {
    note = 'ARCADE_ENGINE is not set, so the bet was placed but not recorded for streaks.';
  } else {
    try {
      await sendRecordEntry(market.marketId, up, filled);
      recorded = true;
    } catch {
      note =
        'Position is live on-chain, but the arcade entry could not be recorded, ' +
        'so this bet will not count towards the streak.';
    }
  }

  return {
    txHash: result.hash,
    explorer: `${EXPLORER}/tx/${result.hash}`,
    shares: toHuman(filled),
    avgPrice,
    cost: toHuman(filled) * avgPrice,
    recorded,
    note,
  };
}

async function sendRecordEntry(marketId: Hex, up: boolean, shares: bigint): Promise<Hex> {
  if (!account) throw new Error('No signer');
  const { createWalletClient } = await import('viem');
  const wallet = createWalletClient({
    account,
    chain: somniaShannon,
    transport: http(config.rpcUrl),
  });
  const hash = await wallet.sendTransaction({
    to: config.arcadeEngine,
    data: encodeFunctionData({
      abi: RECORD_ENTRY_ABI,
      functionName: 'recordEntry',
      args: [marketId, up, shares, 0],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

const PLAYER_STATS_ABI = [
  {
    type: 'function',
    name: 'getPlayerStats',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      { name: 'currentStreak', type: 'uint256' },
      { name: 'best', type: 'uint256' },
      { name: 'multiplier', type: 'uint256' },
      { name: 'wins', type: 'uint256' },
      { name: 'losses', type: 'uint256' },
      { name: 'shares', type: 'uint256' },
    ],
  },
] as const;

export async function getStreak(address: Address) {
  if (!config.arcadeEngine) throw new Error('ARCADE_ENGINE is not configured.');
  const [streak, best, multiplier, wins, losses, shares] = await publicClient.readContract({
    address: config.arcadeEngine,
    abi: PLAYER_STATS_ABI,
    functionName: 'getPlayerStats',
    args: [address],
  });

  const played = Number(wins) + Number(losses);
  const NEXT = [3, 7, 14, 30];
  return {
    address,
    currentStreak: Number(streak),
    longestStreak: Number(best),
    multiplier: Number(multiplier) / 100,
    wins: Number(wins),
    losses: Number(losses),
    winRate: played > 0 ? Math.round((Number(wins) / played) * 100) : 0,
    nextMilestone: NEXT.find((n) => n > Number(streak)) ?? null,
    totalShares: toHuman(shares),
  };
}

// ---------------------------------------------------------------------------
// Arenas (builder codes)
// ---------------------------------------------------------------------------

const DAO_FACTORY_ABI = [
  {
    type: 'function',
    name: 'getDAOCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getDAO',
    stateMutability: 'view',
    inputs: [{ name: 'daoId', type: 'uint256' }],
    outputs: [{ name: 'dao', type: 'tuple', components: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'creator', type: 'address' },
      { name: 'treasury', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint256' },
      { name: 'createdAt', type: 'uint256' },
    ] }],
  },
] as const;

export interface Arena {
  daoId: number;
  name: string;
  symbol: string;
  creator: Address;
  treasury: Address;
  builderFeeBpsTimes1k: number;
  createdAt: number;
}

export async function listArenas(): Promise<Arena[]> {
  if (!config.daoFactory) throw new Error('DAO_FACTORY is not configured.');
  const count = await publicClient.readContract({
    address: config.daoFactory,
    abi: DAO_FACTORY_ABI,
    functionName: 'getDAOCount',
  });
  const arenas: Arena[] = [];
  for (let i = 0; i < Number(count); i++) {
    const dao = await publicClient.readContract({
      address: config.daoFactory,
      abi: DAO_FACTORY_ABI,
      functionName: 'getDAO',
      args: [BigInt(i)],
    });
    arenas.push({
      daoId: i,
      name: dao.name,
      symbol: dao.symbol,
      creator: dao.creator,
      treasury: dao.treasury,
      builderFeeBpsTimes1k: Number(dao.builderFeeBpsTimes1k),
      createdAt: Number(dao.createdAt),
    });
  }
  return arenas;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface Balances {
  address: Address;
  tusdc: number;
  stt: number;
}

/** tUSDC is the SDK collateral (6dp); STT is the native gas coin (18dp). */
export async function getBalances(address: Address): Promise<Balances> {
  const [tusdcRaw, sttRaw] = await Promise.all([
    publicClient.readContract({
      address: SOMNIA_TESTNET_ADDRESSES.testUsdc as Address,
      abi: ERC20_BALANCE_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
    publicClient.getBalance({ address }),
  ]);
  return {
    address,
    tusdc: Number(tusdcRaw) / 1e6,
    stt: Number(sttRaw) / 1e18,
  };
}

// ---------------------------------------------------------------------------
// Shared tool dispatcher
// ---------------------------------------------------------------------------
// The MCP server registers each `dreamarena_*` tool over this dispatcher, and
// the in-app Oracle panel calls the exact same function, so an agent and a
// player drive the same read code with the same tool names. A `describe`
// helper lives here too so both surfaces format a market identically.

export const describe = (m: ArenaMarket) => ({
  marketId: m.marketId,
  asset: m.asset,
  question: m.strike !== null ? `${m.asset} at or above $${m.strike}` : m.question,
  strike: m.strike,
  secondsToExpiry: m.secondsLeft,
  seriesIntervalSec: m.intervalSec,
});

export type ToolResult =
  | { ok: true; content: unknown }
  | { ok: false; error: string };

/**
 * Run a read tool by its MCP name against the live chain. Reads never need a
 * key; they answer from the indexer, the pools, and ArcadeEngine directly.
 */
export async function runReadTool(name: string, args: any = {}): Promise<ToolResult> {
  try {
    switch (name) {
      case 'dreamarena_list_markets': {
        const markets = await listMarkets(args?.limit ?? 12);
        return {
          ok: true,
          content: {
            count: markets.length,
            markets: markets.map(describe),
            note:
              markets.length === 0
                ? 'Nothing open this second — the series roll continuously, so retry shortly.'
                : undefined,
          },
        };
      }
      case 'dreamarena_get_odds': {
        const market = args?.market as string;
        const found = await findMarket(market);
        if (!found) return { ok: false, error: `No live market matches "${market}". Try dreamarena_list_markets.` };
        const quotes = await getQuotes(found);
        return { ok: true, content: { market: describe(found), up: quotes.up, down: quotes.down } };
      }
      case 'dreamarena_assess_risk': {
        const market = args?.market as string;
        const found = await findMarket(market);
        if (!found) return { ok: false, error: `No live market matches "${market}".` };
        return {
          ok: true,
          content: {
            market: describe(found),
            direction: args?.direction,
            ...(await assessRisk(found, args?.direction === 'up')),
          },
        };
      }
      case 'dreamarena_get_streak': {
        const target = args?.address as Address | undefined;
        if (!target) return { ok: false, error: 'No address given and this server has no wallet configured.' };
        return { ok: true, content: await getStreak(target) };
      }
      case 'dreamarena_get_balances': {
        const target = args?.address as Address | undefined;
        if (!target) return { ok: false, error: 'No address given.' };
        return { ok: true, content: await getBalances(target) };
      }
      case 'dreamarena_list_arenas': {
        const arenas = await listArenas();
        return {
          ok: true,
          content: {
            count: arenas.length,
            arenas,
            note:
              arenas.length === 0
                ? 'No arenas deployed yet. The factory is permissionless — anyone can create one on-chain.'
                : undefined,
          },
        };
      }
      case 'dreamarena_status':
        return {
          ok: true,
          content: {
            chain: 'Somnia Shannon testnet (50312)',
            indexer: config.indexerUrl,
            arcadeEngine: config.arcadeEngine || '(not configured)',
            wallet: account?.address ?? '(read-only — no PRIVATE_KEY)',
            canPlaceBets: Boolean(account),
            maxBetTusdc: config.maxBetTusdc,
          },
        };
      default:
        return { ok: false, error: `Unknown tool "${name}".` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Read failed against the chain.' };
  }
}
