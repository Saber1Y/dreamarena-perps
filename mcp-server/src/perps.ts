// The chain layer the perps MCP tools sit on.
//
// The agent signs with its own key (PRIVATE_KEY) and trades OWNER_ADDRESS, a
// wallet that linked it with dreamDEX's Link a Bot: it can place, cancel and
// reduce that wallet's orders, never withdraw. Without OWNER_ADDRESS it trades
// its own account. Every order that adds exposure passes the limits in
// limits.ts first.

import {
  SomniaMarkets,
  SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  contractErrorsAbi,
  marginBankEventsAbi,
  orderBookEventsAbi,
  ORDER_TYPE,
} from '@somnia-chain/markets-sdk';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
  type TransactionReceipt,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { checkOrder, lossLocked, parseLimits, type Limits } from './limits.js';

export const EXPLORER = 'https://explorer.testnet.somnia.network/tokyo';
/** Every perp order goes out with this ceiling, as the bot kit does; gas is billed on use. */
const ORDER_GAS = 10_000_000n;
const ONE = 10n ** 18n; // price and collateral (USDso) both use 18 decimals
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export const config = {
  rpcUrl: process.env.HIDEKI_RPC ?? 'https://api.hideki2.infra.testnet.somnia.network',
  wsRpcUrl: process.env.HIDEKI_WS ?? 'wss://api.hideki2.infra.testnet.somnia.network/ws',
  indexerUrl: process.env.HIDEKI_INDEXER ?? 'https://hideki-dev.smk.somnia.host/v1/graphql',
  privateKey: process.env.PRIVATE_KEY as Hex | undefined,
  slippageBps: BigInt(process.env.SLIPPAGE_BPS ?? '100'),
  limits: parseLimits(process.env),
};

export const bot = config.privateKey ? privateKeyToAccount(config.privateKey) : null;

/** The account the agent trades: the linked wallet, else its own. */
export const owner: Address | null = process.env.OWNER_ADDRESS
  ? getAddress(process.env.OWNER_ADDRESS)
  : (bot?.address ?? null);

const exchange = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: config.indexerUrl,
  wsRpcUrl: config.wsRpcUrl,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
});
const client = exchange.client;
export const closeExchange = () => exchange.close();

export const publicClient = createPublicClient({ chain: hidekiTestnet, transport: http(config.rpcUrl) });
const wallet = bot ? createWalletClient({ account: bot, chain: hidekiTestnet, transport: http(config.rpcUrl) }) : null;

// The SDK ships no ABI for the operator calls, so these come from the dreamDEX
// developer docs; each selector was checked against the deployed PerpPool code.
const POOL_ABI = [
  ...parseAbi([
    'function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)',
    'function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)',
    'function cancelOrder(uint128 orderId)',
    'function cancelOrderFor(address owner, uint128 orderId)',
  ]),
  ...contractErrorsAbi,
];

/** PositionUpdated comes from the MarginBank; OrderPlaced from the pool. */
const RECEIPT_EVENTS_ABI = [...marginBankEventsAbi, ...orderBookEventsAbi];

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** Raw to human, exact enough for display and limits (not for sizing). 12 significant digits drop float noise. */
export const human = (raw: bigint, decimals: number) => Number((Number(raw) / 10 ** decimals).toPrecision(12));
const usd = (raw: bigint) => human(raw, 18);
const roundDown = (x: bigint, step: bigint) => (x / step) * step;
const roundUp = (x: bigint, step: bigint) => ((x + step - 1n) / step) * step;
const abs = (x: bigint) => (x < 0n ? -x : x);
/** The SDK's own GTC default (about 50 years out), in ns. */
const farFutureNs = () => (BigInt(Math.floor(Date.now() / 1000)) + 50n * 365n * 86_400n) * 1_000_000_000n;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Transient transport failures seen on this testnet: the SDK's WebSocket
 * genesis check timing out (`rpc getBlock failed: genesis check failed`) and
 * the indexer dropping a request (`indexer PerpMarkets failed: fetch failed`).
 * Two retries with a short backoff clear them; anything else surfaces at once.
 */
const TRANSIENT = /genesis check failed|timed out|took too long|fetch failed|ECONNRESET|socket hang up/i;

async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !(err instanceof Error && TRANSIENT.test(err.message))) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

/** The market-row fields this layer uses. The indexer types several as strings. */
interface PerpRow {
  baseSymbol: string;
  poolAddress: string;
  marginBank: string;
  baseDecimals: number | string;
  tickSize: string | bigint;
  lotSize: string | bigint;
  minQuantity: string | bigint;
  initialMarginBps: number | string;
  markPrice?: string | bigint | null;
  indexPrice?: string | bigint | null;
  fundingRate?: string | bigint | null;
  fundingIntervalSec?: number | string | null;
  openInterest?: string | bigint | null;
}

export interface Market {
  symbol: string;
  pool: Address;
  marginBank: Address;
  baseDecimals: number;
  tickSize: bigint;
  lotSize: bigint;
  minQuantity: bigint;
  maxLeverage: number;
  /** Indexer snapshot: can lag the chain, so never used to price an order. */
  indexerMark: number | null;
  indexPrice: number | null;
  fundingRatePerInterval: number | null;
  fundingIntervalSec: number | null;
  openInterest: number | null;
}

function toMarket(row: PerpRow): Market {
  const baseDecimals = Number(row.baseDecimals);
  const opt = (v: string | bigint | null | undefined) => (v === null || v === undefined ? null : usd(BigInt(v)));
  return {
    symbol: row.baseSymbol.toUpperCase(),
    pool: getAddress(row.poolAddress),
    marginBank: getAddress(row.marginBank),
    baseDecimals,
    tickSize: BigInt(row.tickSize),
    lotSize: BigInt(row.lotSize),
    minQuantity: BigInt(row.minQuantity),
    maxLeverage: 10_000 / Number(row.initialMarginBps),
    indexerMark: opt(row.markPrice),
    indexPrice: opt(row.indexPrice),
    fundingRatePerInterval: opt(row.fundingRate),
    fundingIntervalSec: row.fundingIntervalSec === null || row.fundingIntervalSec === undefined ? null : Number(row.fundingIntervalSec),
    openInterest: row.openInterest === null || row.openInterest === undefined ? null : human(BigInt(row.openInterest), baseDecimals),
  };
}

let marketCache: { at: number; markets: Market[] } | null = null;

export async function listMarkets(): Promise<Market[]> {
  if (marketCache && Date.now() - marketCache.at < 30_000) return marketCache.markets;
  let rows: PerpRow[];
  try {
    rows = (await retry(() => client.listPerpMarkets())) as unknown as PerpRow[];
  } catch (err) {
    // A pool's address, decimals, tick and lot never change, and orders are
    // priced from chain reads, so a stale list is safe to trade from.
    if (marketCache) return marketCache.markets;
    throw err;
  }
  const markets = rows.map(toMarket).sort((a, b) => a.symbol.localeCompare(b.symbol));
  marketCache = { at: Date.now(), markets };
  return markets;
}

export async function findMarket(symbol: string): Promise<Market> {
  const wanted = symbol.trim().toUpperCase();
  const market = (await listMarkets()).find((m) => m.symbol === wanted);
  if (!market) throw new Error(`No perp market for "${symbol}". Call dreamarena_list_markets for the symbols.`);
  return market;
}

export interface Book {
  bids: { price: number; quantity: number }[];
  asks: { price: number; quantity: number }[];
  bestBid: bigint | null;
  bestAsk: bigint | null;
}

export async function getBook(market: Market, depth = 5): Promise<Book> {
  const book = await retry(() => client.getSpotOrderBook(market.pool, { depth }));
  const level = (l: { price: bigint | string; quantity: bigint | string }) => ({
    price: usd(BigInt(l.price)),
    quantity: human(BigInt(l.quantity), market.baseDecimals),
  });
  return {
    bids: book.bids.map(level),
    asks: book.asks.map(level),
    bestBid: book.bids[0] ? BigInt(book.bids[0].price) : null,
    bestAsk: book.asks[0] ? BigInt(book.asks[0].price) : null,
  };
}

/** The pool's live mark, read from chain rather than the indexer. */
export async function getMark(market: Market): Promise<bigint> {
  const snapshot = await retry(() => client.getPerpHealthSnapshot(market.pool));
  if (!snapshot.priceable) throw new Error(`${market.symbol} has no live mark price right now; try again shortly.`);
  return BigInt(snapshot.markPrice);
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  sizeRaw: bigint;
  entryPrice: number;
  markPrice: number;
  notionalUsdso: number;
  unrealizedPnlUsdso: number;
  liquidationPrice: number | null;
}

async function readPosition(market: Market, account: Address): Promise<Position | null> {
  const position = await retry(() =>
    client.getPerpPosition({ marginBank: market.marginBank, account, pool: market.pool }),
  );
  const size = BigInt(position.size);
  if (size === 0n) return null;

  const mark = await getMark(market);
  const entry = BigInt(position.avgEntryPrice);
  const scale = 10n ** BigInt(market.baseDecimals);
  const liq = await retry(() =>
    client.previewPerpLiquidationPrice({
      pool: market.pool,
      marginBank: market.marginBank,
      account,
      isBid: size < 0n,
      quantity: market.minQuantity,
      price: mark,
    }),
  );
  const current = liq.priceable && liq.currentLiquidationPrice !== null ? BigInt(liq.currentLiquidationPrice) : null;
  return {
    symbol: market.symbol,
    side: size > 0n ? 'long' : 'short',
    size: human(abs(size), market.baseDecimals),
    sizeRaw: size,
    entryPrice: usd(entry),
    markPrice: usd(mark),
    notionalUsdso: usd((abs(size) * mark) / scale),
    unrealizedPnlUsdso: usd((size * (mark - entry)) / scale),
    liquidationPrice: current === null || current === 0n ? null : usd(current),
  };
}

let baselineEquity: number | null = process.env.LOSS_BASELINE_USDSO ? Number(process.env.LOSS_BASELINE_USDSO) : null;

export interface Account {
  owner: Address;
  equityUsdso: number;
  baselineEquityUsdso: number;
  reduceOnly: boolean;
  leverage: number;
  positions: Position[];
}

export async function getAccount(): Promise<Account> {
  if (!owner) throw new Error('No account configured: set OWNER_ADDRESS or PRIVATE_KEY.');
  const markets = await listMarkets();
  const equityRaw = await retry(() => client.tryGetPerpAccountEquity(markets[0].marginBank, owner));
  if (equityRaw === null) throw new Error('Account equity is unavailable: a price feed is stale. Try again shortly.');
  // This equity leaves out margin locked by resting orders (feedback/03), so
  // a resting order lowers it until cancelled. That can only trip the loss
  // limit early, never late.
  const equity = usd(equityRaw);
  // The loss limit is measured from the first equity this process sees, unless pinned by env.
  if (baselineEquity === null) baselineEquity = equity;

  const positions = (await Promise.all(markets.map((m) => readPosition(m, owner)))).filter(
    (p): p is Position => p !== null,
  );
  const exposure = positions.reduce((sum, p) => sum + p.notionalUsdso, 0);
  return {
    owner,
    equityUsdso: equity,
    baselineEquityUsdso: baselineEquity,
    reduceOnly: lossLocked(config.limits, equity, baselineEquity),
    leverage: equity > 0 ? exposure / equity : 0,
    positions,
  };
}

export async function getOpenOrders() {
  if (!owner) throw new Error('No account configured.');
  const portfolio = await retry(() => client.getPerpPortfolio(owner));
  return portfolio.openOrders;
}

// ---------------------------------------------------------------------------
// Order planning
// ---------------------------------------------------------------------------

export type Side = 'long' | 'short';

export interface OrderPlan {
  market: Market;
  isBid: boolean;
  price: bigint;
  quantity: bigint;
  orderType: number;
  reducing: boolean;
  notionalUsdso: number;
  projectedLeverage: number;
  refusal: string | null;
  account: Account;
}

/** The price an IOC should carry: through the touch by the slippage allowance, on the tick. */
function crossingPrice(market: Market, book: Book, isBid: boolean): bigint {
  const touch = isBid ? book.bestAsk : book.bestBid;
  if (touch === null) throw new Error(`The ${market.symbol} book has no ${isBid ? 'asks' : 'bids'} to trade against.`);
  const bps = 10_000n + (isBid ? config.slippageBps : -config.slippageBps);
  const raw = (touch * bps) / 10_000n;
  return isBid ? roundUp(raw, market.tickSize) : roundDown(raw, market.tickSize);
}

function quantityFor(market: Market, notionalUsdso: number, price: bigint): bigint {
  if (!(notionalUsdso > 0)) throw new Error('Order notional must be greater than zero.');
  const notionalRaw = BigInt(Math.round(notionalUsdso * 1e6)) * 10n ** 12n;
  const quantity = roundDown((notionalRaw * 10n ** BigInt(market.baseDecimals)) / price, market.lotSize);
  if (quantity < market.minQuantity) {
    const minUsd = usd((market.minQuantity * price) / 10n ** BigInt(market.baseDecimals));
    throw new Error(`${notionalUsdso} USDso is below ${market.symbol}'s minimum order of about ${minUsd.toFixed(2)} USDso.`);
  }
  return quantity;
}

function finishPlan(
  market: Market,
  account: Account,
  isBid: boolean,
  price: bigint,
  quantity: bigint,
  orderType: number,
  reducing: boolean,
): OrderPlan {
  const notionalUsdso = usd((quantity * price) / 10n ** BigInt(market.baseDecimals));
  const exposure = account.positions.reduce((sum, p) => sum + p.notionalUsdso, 0);
  const projectedLeverage =
    account.equityUsdso > 0 ? (reducing ? exposure - notionalUsdso : exposure + notionalUsdso) / account.equityUsdso : Infinity;
  const refusal = checkOrder(config.limits, {
    symbol: market.symbol,
    reducing,
    notionalUsdso,
    projectedLeverage,
    equityUsdso: account.equityUsdso,
    baselineEquityUsdso: account.baselineEquityUsdso,
  });
  return { market, isBid, price, quantity, orderType, reducing, notionalUsdso, projectedLeverage, refusal, account };
}

/** Plan a market (IOC) order that opens or adds to a position. Refuses to flip an opposite one. */
export async function planOpen(symbol: string, side: Side, notionalUsdso: number): Promise<OrderPlan> {
  const market = await findMarket(symbol);
  const [account, book] = await Promise.all([getAccount(), getBook(market)]);
  const existing = account.positions.find((p) => p.symbol === market.symbol);
  if (existing && existing.side !== side) {
    throw new Error(`There is an open ${existing.side} on ${market.symbol}. Close it with dreamarena_close_position before going ${side}.`);
  }
  const isBid = side === 'long';
  const price = crossingPrice(market, book, isBid);
  const touch = (isBid ? book.bestAsk : book.bestBid) as bigint;
  return finishPlan(market, account, isBid, price, quantityFor(market, notionalUsdso, touch), ORDER_TYPE.MARKET, false);
}

/** Plan a market (IOC) order that closes `percent` of a position. It can never add exposure. */
export async function planClose(symbol: string, percent = 100): Promise<OrderPlan> {
  if (!(percent > 0 && percent <= 100)) throw new Error('percent must be greater than 0 and at most 100.');
  const market = await findMarket(symbol);
  const [account, book] = await Promise.all([getAccount(), getBook(market)]);
  const position = account.positions.find((p) => p.symbol === market.symbol);
  if (!position) throw new Error(`There is no open ${market.symbol} position to close.`);

  const size = abs(position.sizeRaw);
  let quantity = percent === 100 ? size : roundDown((size * BigInt(Math.round(percent * 100))) / 10_000n, market.lotSize);
  // A remainder too small to close later would be stranded, so take it all now.
  if (quantity < market.minQuantity || size - quantity < market.minQuantity) quantity = size;

  const isBid = position.side === 'short';
  return finishPlan(market, account, isBid, crossingPrice(market, book, isBid), quantity, ORDER_TYPE.MARKET, true);
}

/** Plan a resting limit order. It always counts as adding exposure, the conservative reading. */
export async function planLimit(symbol: string, side: Side, price: number, notionalUsdso: number, postOnly: boolean): Promise<OrderPlan> {
  if (!(price > 0)) throw new Error('price must be greater than zero.');
  const market = await findMarket(symbol);
  const account = await getAccount();
  const priceRaw = roundDown(BigInt(Math.round(price * 1e6)) * 10n ** 12n, market.tickSize);
  if (priceRaw === 0n) throw new Error(`price is below ${market.symbol}'s tick size.`);
  const quantity = quantityFor(market, notionalUsdso, priceRaw);
  return finishPlan(market, account, side === 'long', priceRaw, quantity, postOnly ? ORDER_TYPE.POST_ONLY : ORDER_TYPE.LIMIT, false);
}

export function describePlan(plan: OrderPlan) {
  return {
    market: plan.market.symbol,
    side: plan.isBid ? 'buy' : 'sell',
    effect: plan.reducing ? 'reduce' : 'open or add',
    orderType: plan.orderType === ORDER_TYPE.MARKET ? 'market (IOC)' : plan.orderType === ORDER_TYPE.POST_ONLY ? 'post-only limit' : 'limit',
    quantity: human(plan.quantity, plan.market.baseDecimals),
    limitPrice: usd(plan.price),
    notionalUsdso: Number(plan.notionalUsdso.toFixed(4)),
    projectedAccountLeverage: Number(plan.projectedLeverage.toFixed(3)),
    allowed: plan.refusal === null,
    refusal: plan.refusal ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Decode a revert to the contract's error name where the ABI knows it. */
function revertMessage(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const signature = reverted.signature;
      if (name) return `The pool rejected the order: ${name}.`;
      if (signature) return `The pool rejected the order with unknown error ${signature}.`;
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

function ownerChanges(receipt: TransactionReceipt, pool: Address) {
  const changes: { newSize: bigint; avgEntryPrice: bigint; realizedPnl: bigint }[] = [];
  const placed: bigint[] = [];
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({ abi: RECEIPT_EVENTS_ABI, data: log.data, topics: log.topics });
      if (event.eventName === 'PositionUpdated' && getAddress(event.args.account) === owner && getAddress(event.args.perpPool) === pool) {
        changes.push(event.args);
      }
      if (
        event.eventName === 'OrderPlaced' &&
        getAddress(log.address) === pool &&
        getAddress(event.args.placedOrder.owner) === owner &&
        event.args.placedOrder.quantityRemaining > 0n
      ) {
        placed.push(event.args.orderId);
      }
    } catch {
      // a log from another contract or event
    }
  }
  return { changes, placed };
}

export interface Execution {
  txHash: Hex;
  explorer: string;
  gasUsed: number;
  order: ReturnType<typeof describePlan>;
  filled: number;
  positionAfter: { side: Side | 'flat'; size: number; entryPrice: number | null };
  realizedPnlUsdso: number;
  restingOrderId?: string;
}

async function send(functionName: 'placeOrderFor' | 'placeOrder', args: readonly unknown[], to: Address) {
  if (!bot || !wallet) throw new Error('No PRIVATE_KEY configured, so this server is read-only.');
  // Simulate first: a mined revert carries no reason, a simulation does.
  try {
    await publicClient.simulateContract({ account: bot, address: to, abi: POOL_ABI, functionName, args: args as never, gas: ORDER_GAS });
  } catch (err) {
    throw new Error(revertMessage(err));
  }
  const hash = await wallet.writeContract({ address: to, abi: POOL_ABI, functionName, args: args as never, gas: ORDER_GAS });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`The order reverted on-chain: ${EXPLORER}/tx/${hash}`);
  return receipt;
}

export async function execute(plan: OrderPlan): Promise<Execution> {
  if (plan.refusal) throw new Error(plan.refusal);
  if (!owner || !bot) throw new Error('No PRIVATE_KEY configured, so this server is read-only.');
  const { market } = plan;

  const max = await retry(() =>
    client.getMaxPerpOrderSize({ pool: market.pool, marginBank: market.marginBank, account: owner, isBid: plan.isBid, price: plan.price }),
  );
  if (!max.priceable) throw new Error(`${market.symbol} has no live mark price to size against.`);
  if (!max.placeable || plan.quantity > BigInt(max.maxQuantity)) {
    throw new Error(`The account cannot take this order: limited by ${max.limitedBy}.`);
  }

  const before = plan.account.positions.find((p) => p.symbol === market.symbol)?.sizeRaw ?? 0n;
  const common = [plan.isBid, 0n, plan.price, plan.quantity, farFutureNs(), plan.orderType, 0, ZERO_ADDRESS, 0n] as const;
  const receipt =
    owner === bot.address
      ? await send('placeOrder', common, market.pool)
      : await send('placeOrderFor', [owner, ...common], market.pool);

  const { changes, placed } = ownerChanges(receipt, market.pool);
  const last = changes.at(-1);
  const after = last ? last.newSize : before;
  const realized = changes.reduce((sum, c) => sum + c.realizedPnl, 0n);
  return {
    txHash: receipt.transactionHash,
    explorer: `${EXPLORER}/tx/${receipt.transactionHash}`,
    gasUsed: Number(receipt.gasUsed),
    order: describePlan(plan),
    filled: human(abs(after - before), market.baseDecimals),
    positionAfter: {
      side: after === 0n ? 'flat' : after > 0n ? 'long' : 'short',
      size: human(abs(after), market.baseDecimals),
      entryPrice: last && after !== 0n ? usd(last.avgEntryPrice) : null,
    },
    realizedPnlUsdso: usd(realized),
    restingOrderId: placed.length > 0 ? placed.at(-1)!.toString() : undefined,
  };
}

export async function cancelOrder(symbol: string, orderId: string) {
  if (!owner || !bot) throw new Error('No PRIVATE_KEY configured, so this server is read-only.');
  if (!/^\d+$/.test(orderId)) throw new Error('orderId must be the numeric order id.');
  const market = await findMarket(symbol);
  const receipt =
    owner === bot.address
      ? await sendCancel('cancelOrder', [BigInt(orderId)], market.pool)
      : await sendCancel('cancelOrderFor', [owner, BigInt(orderId)], market.pool);
  return { txHash: receipt.transactionHash, explorer: `${EXPLORER}/tx/${receipt.transactionHash}`, cancelled: orderId };
}

async function sendCancel(functionName: 'cancelOrder' | 'cancelOrderFor', args: readonly unknown[], to: Address) {
  if (!bot || !wallet) throw new Error('No PRIVATE_KEY configured, so this server is read-only.');
  try {
    await publicClient.simulateContract({ account: bot, address: to, abi: POOL_ABI, functionName, args: args as never });
  } catch (err) {
    throw new Error(revertMessage(err));
  }
  const hash = await wallet.writeContract({ address: to, abi: POOL_ABI, functionName, args: args as never, gas: ORDER_GAS });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`The cancel reverted on-chain: ${EXPLORER}/tx/${hash}`);
  return receipt;
}

// ---------------------------------------------------------------------------
// Read dispatcher, shared by the MCP server and the app's agent panel
// ---------------------------------------------------------------------------

export type ToolResult = { ok: true; content: unknown } | { ok: false; error: string };

export const describeMarket = (m: Market) => ({
  symbol: m.symbol,
  pool: m.pool,
  maxLeverage: m.maxLeverage,
  allowedForAgent: config.limits.markets.includes(m.symbol),
  indexerMarkPrice: m.indexerMark,
  indexPrice: m.indexPrice,
  fundingRatePerInterval: m.fundingRatePerInterval,
  fundingIntervalSec: m.fundingIntervalSec,
  openInterest: m.openInterest,
});

export function status() {
  return {
    chain: 'Somnia Hideki testnet (50383), shown as Somnia Tokyo',
    trades: owner ?? '(no account)',
    linkedWallet: Boolean(process.env.OWNER_ADDRESS),
    signer: bot?.address ?? '(read-only: no PRIVATE_KEY)',
    canTrade: Boolean(bot),
    limits: { ...config.limits, slippageBps: Number(config.slippageBps) },
    lossBaselineUsdso: baselineEquity,
  };
}

export async function runReadTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  try {
    switch (name) {
      case 'dreamarena_status':
        return { ok: true, content: status() };
      case 'dreamarena_list_markets': {
        const markets = await listMarkets();
        return { ok: true, content: { count: markets.length, markets: markets.map(describeMarket) } };
      }
      case 'dreamarena_get_market': {
        const market = await findMarket(String(args.symbol ?? ''));
        const [mark, book] = await Promise.all([getMark(market), getBook(market, 5)]);
        const spreadBps =
          book.bestBid !== null && book.bestAsk !== null
            ? Number(((book.bestAsk - book.bestBid) * 10_000n) / book.bestAsk)
            : null;
        return {
          ok: true,
          content: { ...describeMarket(market), markPrice: usd(mark), spreadBps, bids: book.bids, asks: book.asks },
        };
      }
      case 'dreamarena_get_account': {
        const [account, openOrders] = await Promise.all([getAccount(), getOpenOrders()]);
        return {
          ok: true,
          content: {
            ...account,
            positions: account.positions.map(({ sizeRaw: _raw, ...p }) => p),
            openOrders,
          },
        };
      }
      case 'dreamarena_preview_order': {
        const side = args.side === 'short' ? 'short' : 'long';
        const plan = await planOpen(String(args.symbol ?? ''), side, Number(args.notionalUsdso));
        const liq = await retry(() =>
          client.previewPerpLiquidationPrice({
            pool: plan.market.pool,
            marginBank: plan.market.marginBank,
            account: plan.account.owner,
            isBid: plan.isBid,
            quantity: plan.quantity,
            price: plan.price,
          }),
        );
        const projected = liq.priceable && liq.projectedLiquidationPrice !== null ? BigInt(liq.projectedLiquidationPrice) : 0n;
        return {
          ok: true,
          content: { ...describePlan(plan), projectedLiquidationPrice: projected === 0n ? null : usd(projected) },
        };
      }
      default:
        return { ok: false, error: `Unknown tool "${name}".` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Read failed against the chain.' };
  }
}
