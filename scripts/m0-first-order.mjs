// M0 check 4: claim paper USDso, open a small perp position with an IOC
// order, then close it, and print every PositionUpdated log the two orders
// emit so realizedPnl's meaning can be read off real data.
//
//   MARKET=ETH NOTIONAL=25 node --env-file=.env m0-first-order.mjs
//
// Needs PRIVATE_KEY in scripts/.env and a little STT on Hideki for gas.

import { ORDER_TYPE } from '@somnia-chain/markets-sdk';
import { decodeEventLog, parseAbi } from 'viem';
import { connect, EXPLORER, fmt } from './hideki.mjs';

const SYMBOL = process.env.MARKET ?? 'ETH';
const NOTIONAL = Number(process.env.NOTIONAL ?? '25'); // USDso
const SLIPPAGE_BPS = 100n; // price the IOC 1% through the mark

if (!process.env.PRIVATE_KEY) throw new Error('Set PRIVATE_KEY in scripts/.env');

const POSITION_ABI = parseAbi([
  'event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)',
]);

const markets = connect(process.env.PRIVATE_KEY);
const { client, trader } = markets;
const account = markets.walletAddress;

const roundDown = (x, step) => (x / step) * step;
const roundUp = (x, step) => ((x + step - 1n) / step) * step;

function positionLogs(receipt) {
  const out = [];
  for (const log of receipt.logs) {
    try {
      const e = decodeEventLog({ abi: POSITION_ABI, data: log.data, topics: log.topics });
      if (e.args.account.toLowerCase() === account.toLowerCase()) out.push(e.args);
    } catch {
      // not a PositionUpdated log
    }
  }
  return out;
}

async function sendIoc(market, isBid, quantity, label) {
  const mark = BigInt(market.markPrice);
  const tick = BigInt(market.tickSize);
  const raw = isBid ? (mark * (10_000n + SLIPPAGE_BPS)) / 10_000n : (mark * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const price = isBid ? roundUp(raw, tick) : roundDown(raw, tick);

  const max = await client.getMaxPerpOrderSize({
    pool: market.poolAddress,
    marginBank: market.marginBank,
    account,
    isBid,
    price,
  });
  console.log(`\n${label}: max size`, max);
  if (!max.priceable) throw new Error('No live mark price to size against');
  if (!max.placeable || quantity > max.maxQuantity) throw new Error(`Order too large: limited by ${max.limitedBy}`);

  const result = await trader.placePerpOrder({
    pool: market.poolAddress,
    isBid,
    price,
    quantity,
    orderType: ORDER_TYPE.MARKET,
  });
  console.log(`${label}: ${result.receipt.status} gasUsed ${result.receipt.gasUsed} fills ${result.fills.length}`);
  console.log(`  ${EXPLORER}/tx/${result.hash}`);
  for (const p of positionLogs(result.receipt)) {
    console.log(`  PositionUpdated newSize ${p.newSize} avgEntry ${fmt(p.avgEntryPrice, 18)} realizedPnl ${p.realizedPnl} (${fmt(p.realizedPnl, 18)} USDso)`);
  }
  return result;
}

try {
  const perps = await client.listPerpMarkets();
  const market = perps.find((m) => m.baseSymbol === SYMBOL);
  if (!market) throw new Error(`No ${SYMBOL} perp market`);
  console.log(`account ${account}\nmarket ${SYMBOL} pool ${market.poolAddress} mark ${fmt(market.markPrice, market.quoteDecimals)}`);

  const campaign = await client.getPerpVoucherCampaign(market.marginBank);
  console.log('voucher campaign', campaign);
  const eligibility = await client.getPerpVoucherEligibility(market.marginBank, account);
  console.log('eligibility', eligibility);
  if (eligibility.eligible) {
    const claim = await trader.claimPerpVoucher({ marginBank: market.marginBank });
    console.log(`claimed voucher: ${EXPLORER}/tx/${claim.hash}`);
  }

  const lot = BigInt(market.lotSize);
  const raw = BigInt(Math.floor((NOTIONAL / fmt(market.markPrice, market.quoteDecimals)) * 10 ** Number(market.baseDecimals)));
  let quantity = roundDown(raw, lot);
  if (quantity < BigInt(market.minQuantity)) quantity = roundUp(BigInt(market.minQuantity), lot);
  console.log(`quantity ${fmt(quantity, market.baseDecimals)} ${SYMBOL} (~${NOTIONAL} USDso)`);

  await sendIoc(market, true, quantity, 'open long');

  const position = await client.getPerpPosition({ marginBank: market.marginBank, account, pool: market.poolAddress });
  console.log('\nposition after open', position);

  const size = BigInt(position.size);
  if (size > 0n) await sendIoc(market, false, size, 'close');

  const after = await client.getPerpPosition({ marginBank: market.marginBank, account, pool: market.poolAddress });
  console.log('\nposition after close', after);
} finally {
  markets.close?.();
}
