// End-to-end proof: place a real bet, wait for the market to expire, and check
// whether the oracle's answer and OUR handler landed in the same block.
//
// Run: PRIVATE_KEY=0x... ARCADE_ENGINE=0x... node scripts/prove-reactivity.mjs
//
// This is the claim the whole project rests on, so it is asserted against the
// chain rather than described. If the reactive callback does not fire, this
// says so.

import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  ORDER_TYPE,
  quoteBinaryStakeOverBook,
} from '@somnia-chain/markets-sdk';
import { somniaShannon } from '@somnia-chain/markets-sdk/chains';
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ENGINE = process.env.ARCADE_ENGINE;
const STAKE_TUSDC = Number(process.env.STAKE ?? '5');
const UNIT = 1_000_000n;

if (!PRIVATE_KEY?.startsWith('0x') || !ENGINE?.startsWith('0x')) {
  console.error('Need PRIVATE_KEY and ARCADE_ENGINE.');
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({
  chain: somniaShannon,
  transport: http('https://dream-rpc.somnia.network'),
});
const wallet = createWalletClient({
  account,
  chain: somniaShannon,
  transport: http('https://dream-rpc.somnia.network'),
});

const exchange = new SomniaMarkets({
  indexerUrl: 'https://dev.smk.somnia.host/v1/graphql',
  chain: somniaShannon,
  wsRpcUrl: 'wss://api.infra.testnet.somnia.network/ws',
  addresses: SOMNIA_TESTNET_ADDRESSES,
});
const client = exchange.client;

const RECORD_ENTRY = parseAbiItem(
  'function recordEntry(bytes32 marketId, bool up, uint256 shares, uint8 gameType)',
);
const GAME_RESOLVED = parseAbiItem(
  'event GameResolved(bytes32 indexed marketId, address indexed player, bool won, uint256 newStreak, uint256 shares)',
);
const ORACLE_ANSWERED = parseAbiItem(
  'event OracleAnswered(bytes32 indexed marketId, bool yesWon, bool voided, uint256 entrantCount)',
);
const ANSWER_DELIVERED = parseAbiItem(
  'event AnswerDelivered(uint256 indexed oracleQuestionId, bytes32 indexed marketId, uint32 payoutDenominator, uint256[] payoutNumerators, bool voided)',
);
const ORACLE_HUB = SOMNIA_TESTNET_ADDRESSES.oracleHub;
const tx = (h) => `https://shannon-explorer.somnia.network/tx/${h}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nDreamArena — reactive settlement proof\n');
console.log('player:', account.address);
console.log('engine:', ENGINE);

// --- 1. Pick a market with enough runway to enter but a short wait.
// Series roll continuously, so "nothing in the window" usually means we asked
// a few seconds before the next batch minted. Wait for it rather than bail.
const now = () => Math.floor(Date.now() / 1000);
const MAX_WAIT = Number(process.env.MAX_WAIT ?? '400');

let market = null;
let quote = null;
let side = null;

for (let attempt = 0; attempt < 12 && !market; attempt++) {
  const rows = await client.listLiveBinaryMarkets({ limit: 24, status: 'Trading' });
  const candidates = rows
    .map((m) => ({ ...m, left: Number(m.expiry) - now() }))
    .filter((m) => m.left > 25 && m.left < MAX_WAIT)
    .sort((a, b) => a.left - b.left);

  for (const m of candidates) {
    const [book, grid] = await Promise.all([
      client.getBinaryOrderBook(m.poolAddress, { depth: 10, decimals: 6 }),
      client.getBinaryBookParams(m.poolAddress),
    ]);
    for (const s of ['BUY_YES', 'BUY_NO']) {
      const q = quoteBinaryStakeOverBook(book, s, BigInt(Math.round(STAKE_TUSDC * 1e6)), UNIT, grid);
      if (q) {
        market = m;
        quote = q;
        side = s;
        break;
      }
    }
    if (market) break;
  }

  if (!market) {
    process.stdout.write(attempt === 0 ? '\nwaiting for a fillable market' : '.');
    await sleep(10_000);
  }
}
console.log();

if (!market) {
  console.error(`Nothing fillable in the 25-${MAX_WAIT}s window after 2 minutes of trying.`);
  process.exit(1);
}

const up = side === 'BUY_YES';
console.log(`\nmarket: ${market.asset} ${market.question?.slice(0, 60)}…`);
console.log(`  id ${market.marketId}`);
console.log(`  ${market.intervalSec}s series, expires in ${Number(market.expiry) - now()}s`);
console.log(`  betting ${up ? 'UP' : 'DOWN'} ${STAKE_TUSDC} tUSDC @ limit ${(Number(quote.limitPrice) / 1e6).toFixed(3)}`);

// --- 2. Place the real order.
const trader = client.createTrader({ privateKey: PRIVATE_KEY });
const order = await trader.placeOrder({
  pool: market.poolAddress,
  side,
  price: quote.yesPrice,
  quantity: quote.quantity,
  orderType: ORDER_TYPE.MARKET,
});
const filled = (order.fills ?? []).reduce((s, f) => s + BigInt(f.quantityFilled), 0n);
console.log(`\n1. order filled: ${(Number(filled) / 1e6).toFixed(3)} shares`);
console.log(`   ${tx(order.hash)}`);
if (filled === 0n) {
  console.error('   Nothing filled — cannot continue.');
  process.exit(1);
}

// --- 3. Record the entry so the reactive leg has something to resolve.
const entryHash = await wallet.sendTransaction({
  to: ENGINE,
  data: encodeFunctionData({
    abi: [RECORD_ENTRY],
    functionName: 'recordEntry',
    args: [market.marketId, up, filled, 0],
  }),
});
await publicClient.waitForTransactionReceipt({ hash: entryHash });
console.log(`2. entry recorded on ArcadeEngine`);
console.log(`   ${tx(entryHash)}`);

// --- 4. Wait for expiry, then watch for our handler to fire.
const waitFor = Math.max(0, Number(market.expiry) - now());
console.log(`\n3. waiting ${waitFor}s for expiry, then up to 180s for the oracle…`);

await sleep((waitFor + 3) * 1000);

let resolved = null;
const deadline = Date.now() + 300_000;
while (Date.now() < deadline) {
  const head = await publicClient.getBlockNumber();
  // Somnia blocks are sub-second and this RPC caps getLogs at 1000 blocks, so
  // the window has to trail the head rather than reach back to the entry.
  const logs = await publicClient.getLogs({
    address: ENGINE,
    event: GAME_RESOLVED,
    args: { marketId: market.marketId, player: account.address },
    fromBlock: head - 999n,
    toBlock: head,
  });
  if (logs.length > 0) {
    resolved = logs[0];
    break;
  }
  process.stdout.write('.');
  await sleep(5000);
}
console.log();

if (!resolved) {
  console.error('\nFAIL: the handler never fired within 180s of expiry.');
  console.error('The market may not have resolved yet, or the subscription is not active.');
  process.exit(1);
}

console.log(`4. handler fired — ${resolved.args.won ? 'WON' : 'LOST'}, streak now ${resolved.args.newStreak}`);
console.log(`   block #${resolved.blockNumber}`);
console.log(`   ${tx(resolved.transactionHash)}`);

// --- 5. The actual claim: same block as the oracle's answer?
const oracleLogs = await publicClient.getLogs({
  address: ORACLE_HUB,
  event: ANSWER_DELIVERED,
  args: { marketId: market.marketId },
  fromBlock: resolved.blockNumber,
  toBlock: resolved.blockNumber,
});

console.log('\n' + '='.repeat(64));
if (oracleLogs.length > 0) {
  console.log(`SAME-BLOCK SETTLEMENT VERIFIED — block #${resolved.blockNumber}`);
  console.log(`  oracle AnswerDelivered : ${oracleLogs[0].transactionHash}`);
  console.log(`  our handler GameResolved: ${resolved.transactionHash}`);
  console.log(`  same tx: ${oracleLogs[0].transactionHash === resolved.transactionHash}`);
  console.log('\nNo keeper, no cron, no backend. The chain pushed the result.');
} else {
  console.log(`Handler fired in block #${resolved.blockNumber}, but the oracle's`);
  console.log(`AnswerDelivered for this market is NOT in that block.`);
  console.log('That means it did not settle through the reactive callback.');
}
console.log('='.repeat(64) + '\n');
process.exit(oracleLogs.length > 0 ? 0 : 1);
