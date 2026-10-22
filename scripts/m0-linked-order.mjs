// M0 check 4b: the bot key places perp orders for a wallet that linked it
// with Link a Bot, through PerpPool.placeOrderFor. Opens a small long with an
// IOC, closes it, and prints the owner's PositionUpdated logs.
//
//   OWNER_ADDRESS=0x... MARKET=ETH NOTIONAL=25 node --env-file=.env m0-linked-order.mjs
//
// The bot pays gas; margin and fills belong to OWNER_ADDRESS.

import { contractErrorsAbi, ORDER_TYPE } from '@somnia-chain/markets-sdk';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import { createWalletClient, decodeEventLog, getAddress, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { connect, EXPLORER, fmt, publicClient, RPC } from './hideki.mjs';

const SYMBOL = process.env.MARKET ?? 'ETH';
const NOTIONAL = Number(process.env.NOTIONAL ?? '25'); // USDso
const SLIPPAGE_BPS = 100n; // price the IOC 1% through the mark
const GAS = 10_000_000n; // what the bot kit sends every perp order with

if (!process.env.PRIVATE_KEY) throw new Error('Set PRIVATE_KEY in scripts/.env');
if (!process.env.OWNER_ADDRESS) throw new Error('Set OWNER_ADDRESS to the wallet that linked this bot');
const owner = getAddress(process.env.OWNER_ADDRESS);
const bot = privateKeyToAccount(process.env.PRIVATE_KEY);

// From "Perps on Testnet for Developers"; the SDK ships no perps placeOrderFor ABI.
const POOL_ABI = [
  ...parseAbi([
    'function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)',
    'event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)',
  ]),
  ...contractErrorsAbi,
];

const wallet = createWalletClient({ account: bot, chain: hidekiTestnet, transport: http(RPC) });
const markets = connect();
const { client } = markets;

const roundDown = (x, step) => (x / step) * step;
const roundUp = (x, step) => ((x + step - 1n) / step) * step;
// The SDK's own default (Writer.farFutureNs): about 50 years out, in ns.
const farFutureNs = () => (BigInt(Math.floor(Date.now() / 1000)) + 50n * 365n * 86_400n) * 1_000_000_000n;

function ownerPositionLogs(receipt) {
  const out = [];
  for (const log of receipt.logs) {
    try {
      const e = decodeEventLog({ abi: POOL_ABI, data: log.data, topics: log.topics });
      if (e.eventName === 'PositionUpdated' && getAddress(e.args.account) === owner) out.push(e.args);
    } catch {
      // another contract's log
    }
  }
  return out;
}

async function placeFor(market, isBid, quantity, label) {
  const mark = BigInt(market.markPrice);
  const tick = BigInt(market.tickSize);
  const raw = isBid ? (mark * (10_000n + SLIPPAGE_BPS)) / 10_000n : (mark * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const price = isBid ? roundUp(raw, tick) : roundDown(raw, tick);

  const max = await client.getMaxPerpOrderSize({
    pool: market.poolAddress,
    marginBank: market.marginBank,
    account: owner,
    isBid,
    price,
  });
  console.log(`\n${label}: max size`, max);
  if (!max.priceable) throw new Error('No live mark price to size against');
  if (!max.placeable || quantity > max.maxQuantity) throw new Error(`Order too large: limited by ${max.limitedBy}`);

  const args = [owner, isBid, 0n, price, quantity, farFutureNs(), ORDER_TYPE.MARKET, 0, '0x0000000000000000000000000000000000000000', 0n];
  // Simulate first: a mined revert carries no reason, a simulation does.
  const { result } = await publicClient.simulateContract({
    account: bot,
    address: market.poolAddress,
    abi: POOL_ABI,
    functionName: 'placeOrderFor',
    args,
    gas: GAS,
  });
  console.log(`${label}: simulation ok, returns`, result);

  const hash = await wallet.writeContract({ address: market.poolAddress, abi: POOL_ABI, functionName: 'placeOrderFor', args, gas: GAS });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`${label}: ${receipt.status} gasUsed ${receipt.gasUsed}`);
  console.log(`  ${EXPLORER}/tx/${hash}`);
  for (const p of ownerPositionLogs(receipt)) {
    console.log(`  PositionUpdated newSize ${p.newSize} avgEntry ${fmt(p.avgEntryPrice, 18)} realizedPnl ${p.realizedPnl} (${fmt(p.realizedPnl, 18)} USDso)`);
  }
  if (receipt.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  return receipt;
}

try {
  const perps = await client.listPerpMarkets();
  const market = perps.find((m) => m.baseSymbol === SYMBOL);
  if (!market) throw new Error(`No ${SYMBOL} perp market`);
  console.log(`bot ${bot.address}\nowner ${owner}\nmarket ${SYMBOL} pool ${market.poolAddress} mark ${fmt(market.markPrice, market.quoteDecimals)}`);

  const lot = BigInt(market.lotSize);
  const raw = BigInt(Math.floor((NOTIONAL / fmt(market.markPrice, market.quoteDecimals)) * 10 ** Number(market.baseDecimals)));
  let quantity = roundDown(raw, lot);
  if (quantity < BigInt(market.minQuantity)) quantity = roundUp(BigInt(market.minQuantity), lot);
  console.log(`quantity ${fmt(quantity, market.baseDecimals)} ${SYMBOL} (~${NOTIONAL} USDso)`);

  const ref = { marginBank: market.marginBank, account: owner, pool: market.poolAddress };
  console.log('\nposition before', await client.getPerpPosition(ref));

  await placeFor(market, true, quantity, 'open long');
  const opened = await client.getPerpPosition(ref);
  console.log('\nposition after open', opened);

  const size = BigInt(opened.size);
  if (size > 0n) await placeFor(market, false, size, 'close');
  console.log('\nposition after close', await client.getPerpPosition(ref));
} finally {
  markets.close?.();
}
