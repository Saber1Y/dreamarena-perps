// M2 live check: the linked bot starts a PerpsArena run for its owner's
// Perps Arena wallet, trades it through the MCP agent's order code, and the
// arena must score the run from Reactivity callbacks alone.
//
//   OWNER_ADDRESS=0x... node --env-file=.env m2-live-arena.mjs streak
//   OWNER_ADDRESS=0x... node --env-file=.env m2-live-arena.mjs survivor
//
// Needs the MCP server built (cd ../mcp-server && npm run build). Every path
// leaves the ETH position flat and the run finished.

import { readFileSync } from 'node:fs';
import { createWalletClient, decodeEventLog, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import { closeExchange, execute, findMarket, planClose, planOpen } from '../mcp-server/dist/perps.js';
import { EXPLORER, publicClient, RPC } from './hideki.mjs';

const mode = process.argv[2];
if (!['streak', 'survivor'].includes(mode)) throw new Error('Usage: m2-live-arena.mjs streak|survivor');
const owner = process.env.OWNER_ADDRESS;
if (!owner || !process.env.PRIVATE_KEY) throw new Error('Set OWNER_ADDRESS and PRIVATE_KEY');

const deployment = JSON.parse(readFileSync(new URL('../contracts/deployments/50383.json', import.meta.url)));
const ARENA = deployment.contracts.perpsArena;
const { abi } = JSON.parse(readFileSync(new URL('../contracts/artifacts/src/PerpsArena.sol/PerpsArena.json', import.meta.url)));
const bot = privateKeyToAccount(process.env.PRIVATE_KEY);
// The RPC sometimes takes over viem's default 10s to accept a transaction.
const wallet = createWalletClient({ account: bot, chain: hidekiTestnet, transport: http(RPC, { timeout: 30_000 }) });

const Game = { Survivor: 1, Streak: 2 };
const STATUS = ['None', 'Active', 'Won', 'Lost', 'Ended'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (functionName, args = []) => publicClient.readContract({ address: ARENA, abi, functionName, args });

// Somnia prices first writes to storage high: a Streak start on a fresh arena
// estimated 2.32M gas and a Survivor start ran out at 3M. Gas is billed on
// use, so send with the same 10M ceiling as perp orders.
const ARENA_GAS = 10_000_000n;

async function send(functionName, args) {
  const hash = await wallet.writeContract({ address: ARENA, abi, functionName, args, gas: ARENA_GAS });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${functionName}: ${receipt.status}, gas ${receipt.gasUsed} ${EXPLORER}/tx/${hash}`);
  if (receipt.status !== 'success') throw new Error(`${functionName} reverted`);
  return receipt;
}

async function trade(label, plan) {
  const done = await execute(await plan);
  console.log(`  ${label}: ${done.positionAfter.side} ${done.positionAfter.size} ETH, realized ${done.realizedPnlUsdso}, block via ${done.explorer}`);
  return done;
}

/** Arena events since `fromBlock`, with the transaction that carried each. */
async function arenaEvents(fromBlock) {
  const logs = [];
  const head = await publicClient.getBlockNumber();
  for (let start = fromBlock; start <= head; start += 1000n) {
    const end = start + 999n > head ? head : start + 999n;
    logs.push(...(await publicClient.getLogs({ address: ARENA, fromBlock: start, toBlock: end })));
  }
  return logs.map((log) => {
    const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
    return { name: event.eventName, args: event.args, block: log.blockNumber, tx: log.transactionHash };
  });
}

async function waitFor(label, predicate, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const run = await read('getRun', [owner]);
    if (predicate(run)) return run;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const fmt = (v) => (typeof v === 'bigint' ? v.toString() : v);

async function report(fromBlock) {
  const run = await read('getRun', [owner]);
  const stats = await read('stats', [owner]);
  console.log(`\nrun: ${STATUS[run.status]}, wins ${run.wins}, runPnl ${Number(run.runPnl) / 1e18}, subs [${run.subs.join(', ')}]`);
  console.log(`stats: ${JSON.stringify(stats, (_k, v) => fmt(v))}`);
  console.log(`arena callbacks so far: ${await read('callbacks')}, active runs ${await read('activeRuns')}`);
  console.log('\narena events:');
  for (const e of await arenaEvents(fromBlock)) {
    console.log(`  block ${e.block} ${e.name} ${JSON.stringify(e.args, (_k, v) => fmt(v))}\n    ${EXPLORER}/tx/${e.tx}`);
  }
}

const eth = await findMarket('ETH');
const startBlock = await publicClient.getBlockNumber();
console.log(`arena ${ARENA}\nplayer ${owner}\nbot ${bot.address}\nmode ${mode}\n`);

try {
  const existing = await read('getRun', [owner]);
  if (existing.status === 1) throw new Error('This player already has an active run; end it first.');

  if (mode === 'streak') {
    await send('startRunFor', [owner, Game.Streak, eth.pool, 0n]);
    const opened = await trade('open long', planOpen('ETH', 'long', 20));
    await waitFor('the open to reach the arena', (r) => r.lastSize !== 0n, 60_000);
    console.log('  arena saw the open');
    await trade('close', planClose('ETH'));
    const after = await waitFor('the close to be scored', (r) => r.lastSize === 0n, 60_000);
    console.log(`  arena scored the close: ${STATUS[after.status]}, wins ${after.wins}`);
    if (after.status === 1) await send('endRun', [owner]);
    void opened;
  } else {
    await trade('open long', planOpen('ETH', 'long', 20));
    const started = await send('startRunFor', [owner, Game.Survivor, eth.pool, 300n]);
    const run = await read('getRun', [owner]);
    console.log(`  deadline ${new Date(Number(run.deadline) * 1000).toISOString()}, schedule sub ${run.subs[2]}`);
    const settled = await waitFor('the scheduled callback', (r) => r.status !== 1, 9 * 60_000);
    console.log(`  run settled by the chain: ${STATUS[settled.status]}`);
    void started;
  }
} finally {
  // Leave the account flat whatever happened above.
  try {
    await trade('cleanup close', planClose('ETH'));
  } catch (err) {
    if (!/no open ETH position/.test(err.message)) console.log('  cleanup close failed:', err.message);
  }
  const run = await read('getRun', [owner]);
  if (run.status === 1) await send('endRun', [owner]);
  await report(startBlock);
  await closeExchange();
}
