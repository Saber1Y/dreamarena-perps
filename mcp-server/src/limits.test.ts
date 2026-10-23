import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOrder, lossLocked, parseLimits, type Limits, type OrderCheck } from './limits.ts';

const limits: Limits = { markets: ['BTC', 'ETH'], maxOrderUsdso: 100, maxLeverage: 5, maxLossUsdso: 50 };
const ok: OrderCheck = {
  symbol: 'ETH',
  reducing: false,
  notionalUsdso: 50,
  projectedLeverage: 1,
  equityUsdso: 1000,
  baselineEquityUsdso: 1000,
};

test('an order inside every limit passes', () => {
  assert.equal(checkOrder(limits, ok), null);
});

test('markets outside the allowlist are refused, case-insensitively matched', () => {
  assert.match(checkOrder(limits, { ...ok, symbol: 'DOGE' }) ?? '', /not in this agent's allowed markets/);
  assert.equal(checkOrder(limits, { ...ok, symbol: 'eth' }), null);
});

test('the per-order notional limit is inclusive', () => {
  assert.equal(checkOrder(limits, { ...ok, notionalUsdso: 100 }), null);
  assert.match(checkOrder(limits, { ...ok, notionalUsdso: 100.01 }) ?? '', /per-order limit/);
});

test('zero or negative notional is refused even when reducing', () => {
  assert.match(checkOrder(limits, { ...ok, notionalUsdso: 0 }) ?? '', /greater than zero/);
  assert.match(checkOrder(limits, { ...ok, notionalUsdso: -5, reducing: true }) ?? '', /greater than zero/);
  assert.match(checkOrder(limits, { ...ok, notionalUsdso: Number.NaN }) ?? '', /greater than zero/);
});

test('leverage above the limit is refused', () => {
  assert.equal(checkOrder(limits, { ...ok, projectedLeverage: 5 }), null);
  assert.match(checkOrder(limits, { ...ok, projectedLeverage: 5.2 }) ?? '', /5\.20x, above the 5x limit/);
});

test('past the loss limit only reducing is allowed', () => {
  const down = { ...ok, equityUsdso: 950, baselineEquityUsdso: 1000 };
  assert.ok(lossLocked(limits, 950, 1000));
  assert.ok(!lossLocked(limits, 950.01, 1000));
  assert.match(checkOrder(limits, down) ?? '', /Only closing or reducing/);
  assert.equal(checkOrder(limits, { ...down, reducing: true }), null);
});

test('reducing ignores the allowlist, size and leverage limits', () => {
  assert.equal(
    checkOrder(limits, { ...ok, reducing: true, symbol: 'DOGE', notionalUsdso: 10_000, projectedLeverage: 50 }),
    null,
  );
});

test('parseLimits applies defaults and normalises markets', () => {
  assert.deepEqual(parseLimits({}), { markets: ['BTC', 'ETH', 'SOL'], maxOrderUsdso: 100, maxLeverage: 5, maxLossUsdso: 100 });
  assert.deepEqual(parseLimits({ ALLOWED_MARKETS: ' eth, btc ,', MAX_LEVERAGE: '3' }).markets, ['ETH', 'BTC']);
});

test('parseLimits refuses malformed values instead of loosening a limit', () => {
  assert.throws(() => parseLimits({ MAX_ORDER_USDSO: 'lots' }), /MAX_ORDER_USDSO/);
  assert.throws(() => parseLimits({ MAX_LEVERAGE: '0' }), /MAX_LEVERAGE/);
  assert.throws(() => parseLimits({ MAX_LOSS_USDSO: '-1' }), /MAX_LOSS_USDSO/);
  assert.throws(() => parseLimits({ ALLOWED_MARKETS: ' , ' }), /ALLOWED_MARKETS is empty/);
});
