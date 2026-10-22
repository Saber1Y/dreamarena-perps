// M0 check 2: how often does MarginBank emit the events PerpsArena would
// react to? A reactive subscription pays for every matching log, so this
// sets what scoring costs.
//
//   node m0-event-rate.mjs [hours=1]

import { parseAbiItem } from 'viem';
import { MARGIN_BANK, publicClient } from './hideki.mjs';

const HOURS = Number(process.argv[2] ?? '1');
const CHUNK = BigInt(process.env.CHUNK ?? '1000');

const EVENTS = {
  PositionUpdated: parseAbiItem(
    'event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)',
  ),
  PositionLiquidated: parseAbiItem(
    'event PositionLiquidated(address indexed account, address indexed perpPool, int128 sizeDelta, uint256 markPrice)',
  ),
};

const head = await publicClient.getBlock();
const probe = await publicClient.getBlock({ blockNumber: head.number - 1000n });
const blockTime = Number(head.timestamp - probe.timestamp) / 1000;
const span = BigInt(Math.ceil((HOURS * 3600) / blockTime));
const from = head.number - span;
console.log(`head ${head.number}, ~${blockTime.toFixed(3)}s/block, scanning ${span} blocks (${HOURS}h) in chunks of ${CHUNK}`);

const counts = Object.fromEntries(Object.keys(EVENTS).map((k) => [k, 0]));
const accounts = new Set();
const samples = [];

for (let start = from; start <= head.number; start += CHUNK) {
  const end = start + CHUNK - 1n > head.number ? head.number : start + CHUNK - 1n;
  for (const [name, event] of Object.entries(EVENTS)) {
    const logs = await publicClient.getLogs({ address: MARGIN_BANK, event, fromBlock: start, toBlock: end });
    counts[name] += logs.length;
    for (const l of logs) {
      accounts.add(l.args.account);
      if (name === 'PositionUpdated' && samples.length < 6) samples.push(l);
    }
  }
}

console.log('\nper hour:');
for (const [name, n] of Object.entries(counts)) console.log(`  ${name.padEnd(19)} ${(n / HOURS).toFixed(1)}  (${n} total)`);
console.log(`  distinct accounts   ${accounts.size}`);

console.log('\nsample PositionUpdated logs (to read realizedPnl semantics):');
for (const l of samples) {
  const a = l.args;
  console.log(`  block ${l.blockNumber} ${a.account.slice(0, 10)} pool ${a.perpPool.slice(0, 10)} newSize ${a.newSize} realizedPnl ${a.realizedPnl}`);
}
