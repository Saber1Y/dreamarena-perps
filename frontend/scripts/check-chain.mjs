// Smoke-test the read path the UI depends on, against live Somnia testnet.
// Run: npm run check:chain
//
// This is the check that would have caught the original build's core defect —
// every read here goes to the real chain, so a fabricated ABI or a mis-scaled
// field fails loudly instead of rendering an empty state that looks like
// "no markets yet".

import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_TESTNET_PRICE_FEED,
  quoteBinaryStakeOverBook,
} from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';

const UNIT = 1_000_000n;
const STAKE = 10n * UNIT;

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
// A check that had nothing to assert must not print as a pass — that is how a
// vacuous green turns into false confidence.
const skip = (label, detail = '') => console.log(` skip  ${label}${detail ? ` — ${detail}` : ''}`);

function humanStrike(row) {
  if (!row?.strike || Number(row.strike) === 0) return null;
  const m = String(row.question ?? '').match(/at or above\s+([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

const ex = new SomniaMarkets({
  indexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  chain: somniaShannon,
  wsRpcUrl: 'wss://api.infra.testnet.somnia.network/ws',
  addresses: SOMNIA_TESTNET_ADDRESSES,
  priceFeed: SOMNIA_TESTNET_PRICE_FEED,
});
const client = ex.client;

console.log('\nDreamArena — live chain check\n');

const started = Date.now();
const rows = await client.listLiveBinaryMarkets({ limit: 24, status: 'Trading' });
const now = Math.floor(Date.now() / 1000);
const live = rows.filter((m) => Number(m.expiry) > now);
check('markets board', live.length > 0, `${live.length} open in ${Date.now() - started}ms`);

let fillable = 0;
for (const m of live.slice(0, 5)) {
  const [book, grid] = await Promise.all([
    client.getBinaryOrderBook(m.poolAddress, { depth: 10, decimals: 6 }),
    client.getBinaryBookParams(m.poolAddress),
  ]);
  const up = quoteBinaryStakeOverBook(book, 'BUY_YES', STAKE, UNIT, grid);
  const down = quoteBinaryStakeOverBook(book, 'BUY_NO', STAKE, UNIT, grid);

  // The escrow is the max loss and must never exceed the stake.
  for (const [side, q] of [['UP', up], ['DOWN', down]]) {
    if (q && q.escrow > STAKE) {
      check(`${m.asset} ${side} escrow within stake`, false, `${q.escrow} > ${STAKE}`);
    }
    if (q && (q.quantity % grid.lotSize !== 0n || q.yesPrice % grid.tickSize !== 0n)) {
      check(`${m.asset} ${side} grid-aligned`, false, 'off tick/lot — the pool would reject this');
    }
  }
  if (up || down) fillable++;
}
check('quotes fill', fillable > 0, `${fillable}/${Math.min(5, live.length)} markets fillable at 10 tUSDC`);

const withStrike = live.filter((m) => Number(m.strike) > 0);
const parsed = withStrike.filter((m) => humanStrike(m) !== null);
if (withStrike.length === 0) {
  skip('strike parsing', 'no live market carries a strike right now');
} else {
  check('strike parsing', parsed.length > 0,
    parsed.length > 0
      ? `e.g. ${parsed[0].asset} $${humanStrike(parsed[0]).toLocaleString()}`
      : `0 of ${withStrike.length} parsed`);
}

for (const asset of ['BTC', 'ETH']) {
  const info = await client.fetchPriceFeedInfo(asset).catch(() => null);
  check(`${asset} price feed`, !!info?.latest?.price, info?.latest?.price ? `$${info.latest.price.toLocaleString()}` : 'no price');
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
