// M0 check 1: can we read the perps markets, and does the MarginBank the
// docs name match the one every market row points at?

import { connect, fmt, MARGIN_BANK } from './hideki.mjs';

const markets = connect();
try {
  const perps = await markets.client.listPerpMarkets();
  console.log(`${perps.length} perp markets\n`);

  const banks = new Set(perps.map((m) => m.marginBank?.toLowerCase()));
  console.log('marginBank on rows:', [...banks].join(', '));
  console.log('matches docs:      ', banks.size === 1 && banks.has(MARGIN_BANK.toLowerCase()));

  const config = await markets.client.getPerpSystemConfig(perps[0].marginBank);
  console.log('system config:     ', config, '\n');

  const sample = perps[0];
  console.log('row keys:', Object.keys(sample).join(', '), '\n');

  for (const m of perps) {
    console.log(
      `${String(m.baseSymbol).padEnd(9)} pool ${m.poolAddress}  baseDec ${String(m.baseDecimals).padStart(2)}  quoteDec ${m.quoteDecimals}` +
        (m.markPrice != null ? `  mark ${fmt(m.markPrice, m.quoteDecimals)}` : ''),
    );
  }
} finally {
  markets.close?.();
}
