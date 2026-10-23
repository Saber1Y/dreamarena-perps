// Shapes the API routes return. Shared by server and client; no secrets here.

export type GameName = 'Survivor' | 'Streak' | 'Boss';
export type RunStatus = 'None' | 'Active' | 'Won' | 'Lost' | 'Ended';

export const GAMES: GameName[] = ['Survivor', 'Streak', 'Boss'];
export const BOSS_ROUNDS = 3;
export const SURVIVAL_CHOICES = [
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
];

export interface RunView {
  game: GameName | null;
  status: RunStatus;
  pool: string | null;
  symbol: string | null;
  startedAt: number;
  /** Unix seconds; 0 unless Survivor. */
  deadline: number;
  wins: number;
  /** Position size the arena last saw, raw base units, as a string. */
  lastSize: string;
  tradePnl: number;
  runPnl: number;
}

export interface StatsView {
  runs: number;
  survived: number;
  bestStreak: number;
  bossesSlain: number;
  liquidations: number;
  closedTrades: number;
  winningTrades: number;
  realizedPnl: number;
}

export interface ArenaView {
  address: string;
  balanceStt: number;
  minimumStt: number;
  callbacks: number;
  activeRuns: number;
  playerCount: number;
  paused: boolean;
  head: number;
}

export interface PlayerView {
  address: string;
  run: RunView;
  stats: StatsView;
}

export interface LeaderRow extends PlayerView {
  winRate: number | null;
}

export type FeedKind = 'RunStarted' | 'Reacted' | 'TradeScored' | 'RunFinished' | 'Liquidated';

export interface FeedEvent {
  id: string;
  kind: FeedKind;
  player: string;
  block: number;
  /** Block time, unix ms. */
  time: number;
  tx: string;
  game?: GameName;
  status?: RunStatus;
  symbol?: string | null;
  pnl?: number;
  won?: boolean;
  wins?: number;
  /** For Reacted: what the chain delivered and the proof it was same-block. */
  trigger?: {
    source: 'PositionUpdated' | 'PositionLiquidated' | 'Schedule';
    /** The trade whose MarginBank log fired the callback, when found in the same block. */
    orderTx: string | null;
    sameBlock: boolean;
    /** Schedule only: seconds between the run's deadline and the callback's block. */
    lateBySeconds?: number;
  };
}

export interface FeedView {
  events: FeedEvent[];
  fromBlock: number;
  head: number;
}

export interface SessionView {
  configured: boolean;
  unlocked: boolean;
  owner: string | null;
  bot: string | null;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  notionalUsdso: number;
  unrealizedPnlUsdso: number;
  liquidationPrice: number | null;
}

export interface AccountView {
  owner: string;
  equityUsdso: number;
  baselineEquityUsdso: number;
  reduceOnly: boolean;
  leverage: number;
  positions: Position[];
  /** Null when the dreamDEX indexer is not answering; positions still come from chain. */
  openOrders: unknown[] | null;
  openOrdersUnavailable?: string;
}

export interface MarketView {
  symbol: string;
  pool: string;
  maxLeverage: number;
  allowedForAgent: boolean;
  indexerMarkPrice: number | null;
  indexPrice: number | null;
  fundingRatePerInterval: number | null;
  fundingIntervalSec: number | null;
  openInterest: number | null;
}

export interface MarketDetail extends MarketView {
  markPrice: number;
  spreadBps: number | null;
  bids: { price: number; quantity: number }[];
  asks: { price: number; quantity: number }[];
}

export interface PreviewView {
  market: string;
  side: 'buy' | 'sell';
  effect: string;
  orderType: string;
  quantity: number;
  limitPrice: number;
  notionalUsdso: number;
  projectedAccountLeverage: number;
  allowed: boolean;
  refusal?: string;
  projectedLiquidationPrice: number | null;
}

export interface AgentStatus {
  chain: string;
  trades: string;
  linkedWallet: boolean;
  signer: string;
  canTrade: boolean;
  limits: { markets: string[]; maxOrderUsdso: number; maxLeverage: number; maxLossUsdso: number; slippageBps: number };
  lossBaselineUsdso: number | null;
}

export interface Execution {
  txHash: string;
  explorer: string;
  gasUsed: number;
  filled: number;
  positionAfter: { side: 'long' | 'short' | 'flat'; size: number; entryPrice: number | null };
  realizedPnlUsdso: number;
}

export interface ArenaTx {
  txHash: string;
  explorer: string;
  gasUsed: number;
}
