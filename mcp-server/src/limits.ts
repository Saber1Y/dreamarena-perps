// The agent's hard limits, as pure functions so they can be tested without a
// chain. An agent with a key needs bounds it cannot talk itself past, so these
// run in the order path, not in a prompt.

export interface Limits {
  /** Base symbols the agent may open or add to. Closing works on any market. */
  markets: string[];
  /** Largest notional for one order that adds exposure, in USDso. */
  maxOrderUsdso: number;
  /** Largest account leverage (total position notional / equity) after an order. */
  maxLeverage: number;
  /** Equity drop from the baseline at which the agent may only reduce. */
  maxLossUsdso: number;
}

export interface OrderCheck {
  symbol: string;
  /** True when the order can only shrink an existing position. */
  reducing: boolean;
  notionalUsdso: number;
  /** Account leverage if this order fills in full. */
  projectedLeverage: number;
  equityUsdso: number;
  baselineEquityUsdso: number;
}

const DEFAULTS: Limits = { markets: ['BTC', 'ETH', 'SOL'], maxOrderUsdso: 100, maxLeverage: 5, maxLossUsdso: 100 };

function positive(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return value;
}

/** Read limits from the environment. A malformed value stops the server rather than loosening a limit. */
export function parseLimits(env: Record<string, string | undefined>): Limits {
  const markets = env.ALLOWED_MARKETS?.trim()
    ? env.ALLOWED_MARKETS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULTS.markets;
  if (markets.length === 0) throw new Error('ALLOWED_MARKETS is empty');
  return {
    markets,
    maxOrderUsdso: positive('MAX_ORDER_USDSO', env.MAX_ORDER_USDSO, DEFAULTS.maxOrderUsdso),
    maxLeverage: positive('MAX_LEVERAGE', env.MAX_LEVERAGE, DEFAULTS.maxLeverage),
    maxLossUsdso: positive('MAX_LOSS_USDSO', env.MAX_LOSS_USDSO, DEFAULTS.maxLossUsdso),
  };
}

/** True once equity has fallen far enough below the baseline that only reducing is allowed. */
export function lossLocked(limits: Limits, equityUsdso: number, baselineEquityUsdso: number): boolean {
  return baselineEquityUsdso - equityUsdso >= limits.maxLossUsdso;
}

/** The reason an order is refused, or null when it is within every limit. */
export function checkOrder(limits: Limits, order: OrderCheck): string | null {
  if (!(order.notionalUsdso > 0)) return 'Order notional must be greater than zero.';
  // Reducing is always allowed: it is how the agent gets out of trouble.
  if (order.reducing) return null;

  if (!limits.markets.includes(order.symbol.toUpperCase())) {
    return `${order.symbol} is not in this agent's allowed markets (${limits.markets.join(', ')}).`;
  }
  if (order.notionalUsdso > limits.maxOrderUsdso) {
    return `Order notional ${order.notionalUsdso.toFixed(2)} USDso exceeds the per-order limit of ${limits.maxOrderUsdso} USDso.`;
  }
  if (lossLocked(limits, order.equityUsdso, order.baselineEquityUsdso)) {
    const lost = order.baselineEquityUsdso - order.equityUsdso;
    return `Equity is down ${lost.toFixed(2)} USDso from the baseline, past the ${limits.maxLossUsdso} USDso loss limit. Only closing or reducing is allowed.`;
  }
  if (order.projectedLeverage > limits.maxLeverage) {
    return `This order would take account leverage to ${order.projectedLeverage.toFixed(2)}x, above the ${limits.maxLeverage}x limit.`;
  }
  return null;
}
