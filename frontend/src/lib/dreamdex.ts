// DreamArena's data layer: the live DreamDEX binary markets, their books, and
// the real orders players place on them.
//
// Everything here goes through @somnia-chain/markets-sdk against Somnia Shannon
// testnet. There is no mock, fixture, or synthetic price anywhere in this file.
//
// We use the SDK's CLIENT tier rather than the unified exchange tier. The
// exchange keys everything by synthesized symbol, which means `loadMarkets()`
// (~3s, every pool's grid read) must finish before any verb resolves. The
// client's `listLiveBinaryMarkets` answers the board question in ~500ms and the
// trader takes a pool address directly, so nothing here waits on that registry.

import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  ORDER_TYPE,
  quoteBinaryStakeOverBook,
} from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';
import { createPublicClient, encodeFunctionData, http, type Address, type WalletClient } from 'viem';
import { ARCADE_ENGINE_ABI } from './abis';
import { CONTRACTS } from './web3';

const INDEXER_URL =
  process.env.NEXT_PUBLIC_SOMNIA_INDEXER ?? 'https://dev.smk.somnia.host/v1/graphql';
const WS_RPC_URL =
  process.env.NEXT_PUBLIC_SOMNIA_WS ?? 'wss://api.infra.testnet.somnia.network/ws';

/** Outcome tokens and tUSDC are both 6dp on this venue. */
export const DECIMALS = 6;
const UNIT = 10 ** DECIMALS;

export const toHuman = (raw: bigint | string | number) => Number(raw) / UNIT;
export const toRaw = (human: number) => BigInt(Math.round(human * UNIT));

// ---------------------------------------------------------------------------
// The exchange singleton
// ---------------------------------------------------------------------------

let exchange: SomniaMarkets | null = null;

/**
 * One exchange for the tab. The WebSocket opens lazily on the first chain read,
 * so merely constructing this during an SSR pass costs nothing.
 */
export function getExchange(): SomniaMarkets {
  if (!exchange) {
    exchange = new SomniaMarkets({
      indexerUrl: INDEXER_URL,
      chain: somniaShannon,
      wsRpcUrl: WS_RPC_URL,
      addresses: SOMNIA_TESTNET_ADDRESSES,
      // Without this the price-feed reads throw NotConfiguredError, which our
      // callers would swallow into a permanent null.
      priceFeed: SOMNIA_TESTNET_PRICE_FEED,
    });
  }
  return exchange;
}

export const getClient = () => getExchange().client;

/**
 * A plain viem client for OUR contracts. The SDK's client speaks to the
 * protocol; ArcadeEngine's own events (streaks, settlements) are read with
 * this one.
 */
export const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http(process.env.NEXT_PUBLIC_SOMNIA_RPC ?? 'https://dream-rpc.somnia.network'),
});

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

/**
 * The market row's `strike` is raw "in the oracle's price scale", and that scale
 * is a per-series property that never reaches the market row — so dividing by
 * the collateral unit renders BTC's 78,786 strike as $7.87.
 *
 * The question text carries the human number verbatim, so we read it from
 * there and get an exact value. When it does not parse we return null and the
 * UI labels the market from its question instead of printing a wrong price.
 */
function humanStrike(row: any): number | null {
  if (!row?.strike || Number(row.strike) === 0) return null;
  const match = String(row.question ?? '').match(/at or above\s+([\d,]+(?:\.\d+)?)/i);
  if (!match) return null;
  const value = parseFloat(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export interface ArenaMarket {
  /** bytes32 market id — the protocol's key, and what ArcadeEngine records. */
  marketId: `0x${string}`;
  /** The binary pool holding the order book. */
  pool: Address;
  /** "BTC" | "ETH" */
  asset: string;
  /** The market's own question text, verbatim from the oracle. */
  question: string;
  /**
   * Strike in human USD, or null when the series has none (the "closes above
   * its open" markets) or the value could not be read exactly.
   */
  strike: number | null;
  /** Unix seconds. */
  expiry: number;
  tradingStart: number;
  /** Series cadence in seconds — 60 markets are the arcade's bread and butter. */
  intervalSec: number;
  yesTokenId: bigint;
  noTokenId: bigint;
  status: string;
}

function toArenaMarket(row: any): ArenaMarket | null {
  if (!row?.marketId || !row?.poolAddress) return null;
  return {
    marketId: row.marketId as `0x${string}`,
    pool: row.poolAddress as Address,
    asset: row.asset ?? '?',
    question: row.question ?? '',
    strike: humanStrike(row),
    expiry: Number(row.expiry ?? 0),
    tradingStart: Number(row.tradingStart ?? 0),
    intervalSec: Number(row.intervalSec ?? 0),
    yesTokenId: BigInt(row.yesTokenId ?? 0),
    noTokenId: BigInt(row.noTokenId ?? 0),
    status: row.status ?? row.clobStatus ?? 'Unknown',
  };
}

/**
 * The live board: binary markets still open for trading, soonest to expire
 * first. These roll continuously — a 60s series mints a fresh market every
 * minute — so a cached list goes stale in seconds. Always re-read.
 */
export async function listLiveMarkets(limit = 24): Promise<ArenaMarket[]> {
  const rows = await getClient().listLiveBinaryMarkets({ limit, status: 'Trading' });
  const now = Math.floor(Date.now() / 1000);
  return rows
    .map(toArenaMarket)
    .filter((m): m is ArenaMarket => m !== null)
    // A market whose expiry has passed is unfillable even if the indexer has
    // not caught up yet; sending an order to one just burns gas on a revert.
    .filter((m) => m.expiry > now);
}

export async function getMarket(marketId: string): Promise<ArenaMarket | null> {
  const row = await getClient().getBinaryMarket(marketId);
  return row ? toArenaMarket(row) : null;
}

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------

export interface Odds {
  /** Best price to BUY this side now, 0..1 — i.e. implied probability. */
  ask: number | null;
  /** Best price someone will BUY this side from you at. */
  bid: number | null;
  /** Mid, when both sides are quoted. The honest "odds" number. */
  mid: number | null;
  /** What 1 tUSDC returns if this side wins — 1/ask. */
  payoutPerUnit: number | null;
}

function bestOf(levels: Array<{ price: bigint | number }> | undefined): number | null {
  const top = levels?.[0];
  if (!top) return null;
  return Number(top.price) / UNIT;
}

/**
 * Read the pool's resting book and turn it into odds for one side.
 *
 * Binary books are quoted in YES terms; the NO side is the YES book inverted,
 * which the SDK already does for us in the 4-sided view.
 */
export async function getOdds(pool: Address, up: boolean): Promise<Odds> {
  const book: any = await getClient().getBinaryOrderBook(pool, { depth: 5, decimals: DECIMALS });

  const asks = up ? book.yesAsks : book.noAsks;
  const bids = up ? book.yesBids : book.noBids;

  const ask = bestOf(asks);
  const bid = bestOf(bids);
  const mid = ask !== null && bid !== null ? (ask + bid) / 2 : (ask ?? bid);

  return { ask, bid, mid, payoutPerUnit: ask && ask > 0 ? 1 / ask : null };
}

/**
 * Live index price for an asset, straight from the on-chain EMA oracle.
 * `latest.price` is already in human units (the feed is 18dp, not 6) — do not
 * scale it by the collateral unit.
 */
export async function getSpotPrice(asset: string): Promise<number | null> {
  try {
    const info = await getClient().fetchPriceFeedInfo(asset);
    return info?.latest?.price ?? null;
  } catch {
    return null; // no feed for this asset — the UI just omits the reference price
  }
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

export interface BetParams {
  market: ArenaMarket;
  /** true = UP / YES, false = DOWN / NO. */
  up: boolean;
  /** What the player wants to spend, in tUSDC. */
  stake: number;
  walletClient: WalletClient;
  /** Protective-limit cushion in bps against a moving book (SDK default 300). */
  slippageBps?: number;
  /**
   * Arena builder code — the DAO treasury that earns on this flow.
   *
   * Note for wiring arena routing: the pool requires a prior
   * `trader.approveBuilder(...)` opt-in from THIS wallet, or a non-zero
   * `builderFeeBpsTimes1k` reverts. Approve once per pool before routing.
   */
  builder?: Address;
  builderFeeBpsTimes1k?: bigint;
}

export interface BetResult {
  txHash: string;
  /** Outcome-token quantity actually acquired, raw units. */
  shares: bigint;
  /** Price paid per share, 0..1. */
  price: number;
  /** tUSDC actually committed. */
  cost: number;
  explorer: string;
}

export const explorerTx = (hash: string) => `https://shannon-explorer.somnia.network/tx/${hash}`;

/**
 * Place a real bet: a taker order on the market's own order book.
 *
 * A binary "bet" is buying outcome shares. Each winning share redeems for
 * exactly 1 tUSDC, so a share bought at 0.40 pays 2.5x — the payout comes from
 * the market's price, not from a house. Spending `stake` at price `p` therefore
 * buys `stake / p` shares.
 */
export async function placeBet(params: BetParams): Promise<BetResult> {
  const { market, up, stake, walletClient, slippageBps, builder, builderFeeBpsTimes1k } = params;
  if (stake <= 0) throw new Error('Stake must be greater than zero');
  if (market.expiry <= Math.floor(Date.now() / 1000)) {
    throw new Error('That market just expired — pick the next one in the series');
  }

  const client = getClient();
  const side = up ? 'BUY_YES' : 'BUY_NO';

  // Let the SDK size the order. It sweeps the asks cheapest-first, keeps the
  // escrow inside the stake, pads a protective limit, and — the part that
  // matters — snaps price to the tick grid and quantity to the lot grid. This
  // venue's grid is 3dp, so an unaligned order is rejected outright, and the
  // protective limit has to be expressed in YES terms even for a DOWN bet.
  const [book, grid] = await Promise.all([
    client.getBinaryOrderBook(market.pool, { depth: 10, decimals: DECIMALS }),
    client.getBinaryBookParams(market.pool),
  ]);

  const quote = quoteBinaryStakeOverBook(book, side, toRaw(stake), BigInt(UNIT), {
    tickSize: grid.tickSize,
    lotSize: grid.lotSize,
    ...(slippageBps !== undefined ? { slippageBps: BigInt(slippageBps) } : {}),
  });

  if (!quote) {
    throw new Error(
      `Nobody is offering ${up ? 'UP' : 'DOWN'} on this market right now, ` +
        `or the stake is below one lot. Try the other side, a bigger stake, or another market.`,
    );
  }

  const trader = client.createTrader({ walletClient });
  const result = await trader.placeOrder({
    pool: market.pool,
    side,
    price: quote.yesPrice, // already YES-terms and tick-aligned
    quantity: quote.quantity,
    orderType: ORDER_TYPE.MARKET, // 2 = immediate-or-cancel; 1 is fill-or-kill
    builder,
    builderFeeBpsTimes1k,
  });

  // What actually filled, not what we asked for — a taker order on a thin book
  // routinely fills partially, and the player owns only what they got.
  const filled = (result.fills ?? []).reduce((sum, f) => sum + f.quantityFilled, 0n);
  if (filled === 0n) {
    throw new Error(
      'The order did not fill — the book moved before it landed. Try again.',
    );
  }

  // Volume-weighted average of the real fill prices, back in this side's terms.
  const oneUnit = BigInt(UNIT);
  const notional = (result.fills ?? []).reduce(
    (sum, f) => sum + f.quantityFilled * (up ? f.fillPrice : oneUnit - f.fillPrice),
    0n,
  );
  const avgPrice = Number(notional) / Number(filled) / UNIT;

  return {
    txHash: result.hash,
    shares: filled,
    price: avgPrice,
    cost: toHuman(filled) * avgPrice,
    explorer: explorerTx(result.hash),
  };
}

/**
 * Settle a market on ArcadeEngine from its own on-chain state.
 *
 * The reactive callback is the fast path, but OracleHub does not emit
 * AnswerDelivered for every market it finalizes, so an entry can sit unsettled
 * with the market long since resolved. This is the permissionless catch-up —
 * anyone can call it, and it is a no-op when there is nothing to do.
 */
export async function settleMarket(
  walletClient: WalletClient,
  marketId: `0x${string}`,
  limit = 50,
): Promise<string> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  return walletClient.sendTransaction({
    account,
    chain: somniaShannon,
    to: CONTRACTS.arcadeEngine as Address,
    data: encodeFunctionData({
      abi: ARCADE_ENGINE_ABI,
      functionName: 'settleMarket',
      args: [marketId, BigInt(limit)],
    }),
  } as Parameters<typeof walletClient.sendTransaction>[0]);
}

/** Whether `settleMarket` would actually do something for this market. */
export async function needsSettlement(marketId: `0x${string}`): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: CONTRACTS.arcadeEngine as Address,
      abi: ARCADE_ENGINE_ABI,
      functionName: 'needsSettlement',
      args: [marketId],
    }) as boolean;
  } catch {
    return false;
  }
}

/**
 * Tell ArcadeEngine the player took this side, so the reactive settlement can
 * move their streak when the oracle answers. Separate from the trade on
 * purpose: the money leg is the market's, this leg is only the game's.
 */
export async function recordEntry(
  walletClient: WalletClient,
  market: ArenaMarket,
  up: boolean,
  shares: bigint,
  gameType: number,
): Promise<string> {
  const account = walletClient.account;
  if (!account) throw new Error('Wallet not connected');

  return walletClient.sendTransaction({
    account,
    chain: somniaShannon,
    to: CONTRACTS.arcadeEngine as Address,
    data: encodeFunctionData({
      abi: ARCADE_ENGINE_ABI,
      functionName: 'recordEntry',
      args: [market.marketId, up, shares, gameType],
    }),
  } as Parameters<typeof walletClient.sendTransaction>[0]);
}

// ---------------------------------------------------------------------------
// Claiming
// ---------------------------------------------------------------------------

export interface Claimable {
  marketId: `0x${string}`;
  pool: Address;
  /** 0 = YES (UP), 1 = NO (DOWN). */
  outcomeIdx: 0 | 1;
  /** Winning shares held, raw units. */
  shares: bigint;
  /** tUSDC this redeems for, net of the settlement fee. */
  payout: number;
  status: string;
}

/**
 * Everything the wallet can redeem right now, across every settled market.
 *
 * Winners get `shares x (1 - settlementFee)`; a voided market pays both sides
 * half; losing and still-trading positions are omitted. The SDK does that
 * arithmetic — reimplementing it would be inventing a second source of truth
 * for how much a player is owed.
 */
export async function listClaimable(owner: Address): Promise<Claimable[]> {
  const rows = await getClient().getClaimable(owner);
  return rows.map((r) => ({
    marketId: r.marketId as `0x${string}`,
    pool: r.pool as Address,
    outcomeIdx: r.outcomeIdx,
    shares: r.amount,
    payout: toHuman(r.estPayout),
    status: r.status,
  }));
}

/**
 * Redeem winning shares for tUSDC — in one transaction, however many markets.
 *
 * This is the payout. It comes from the market's own settlement, which is why
 * DreamArena needs no bankroll.
 */
export async function claimAll(
  walletClient: WalletClient,
  positions: Claimable[],
): Promise<string> {
  if (positions.length === 0) throw new Error('Nothing to claim');
  const trader = getClient().createTrader({ walletClient });
  const result = await trader.redeemMany({
    entries: positions.map((p) => ({
      marketId: p.marketId,
      outcomeIdx: p.outcomeIdx,
      amount: p.shares,
    })),
  });
  return result.hash;
}

// ---------------------------------------------------------------------------
// Arena builder codes
// ---------------------------------------------------------------------------

/**
 * Opt this wallet into paying an arena's builder fee on a given pool.
 *
 * The pool rejects any order carrying a non-zero `builderFeeBpsTimes1k` without
 * a prior approval from the trader, so this has to happen once per pool before
 * routed orders will land.
 */
export async function approveArena(
  walletClient: WalletClient,
  pool: Address,
  builder: Address,
  maxFeeBpsTimes1k: bigint,
): Promise<string> {
  const trader = getClient().createTrader({ walletClient });
  const result = await trader.approveBuilder({ pool, builder, maxFeeBpsTimes1k });
  return result.hash;
}

/**
 * The pool's own ceiling on builder fees (bps x 1000), frozen when the pool
 * was created. An order or approval above it reverts `BuilderFeeExceedsCap`
 * before anything else is checked — so it is the number an arena's fee has to
 * be clamped to, not the factory's MAX_BUILDER_FEE_BPS_TIMES_1K. On Shannon
 * every live pool currently reports 0.
 */
export async function getPoolBuilderFeeCap(pool: Address): Promise<bigint> {
  return getClient().getMaxBuilderFeeBpsTimes1k(pool);
}

/** What an arena can actually charge on a pool: its fee, or the pool's cap if lower. */
export const effectiveBuilderFee = (arenaFee: bigint, poolCap: bigint) =>
  arenaFee < poolCap ? arenaFee : poolCap;

/** The trader's current builder allowance on a pool (0 = not opted in). */
export async function getArenaApproval(
  owner: Address,
  pool: Address,
  builder: Address,
): Promise<bigint> {
  try {
    return await getClient().getEffectiveBuilderApproval({ pool, user: owner, builder });
  } catch {
    return 0n;
  }
}
