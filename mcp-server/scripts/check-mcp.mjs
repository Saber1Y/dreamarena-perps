// Drive the MCP server over stdio exactly as a client would.
// Run: npm run check  (after npm run build)
//
// Reads are asserted against the live chain. The write tool is expected to
// refuse when no PRIVATE_KEY is set — that refusal is the safety property, so
// it is checked, not skipped.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'fs';

// Pass the live deploy's addresses into the spawned server so the checks read
// OUR contracts, not an empty unconfigured instance that answers "not set".
const deploy = JSON.parse(readFileSync('../contracts/deployments/50312.json', 'utf8'));
const env = {
  ...process.env,
  ARCADE_ENGINE: deploy.contracts?.arcadeEngine ?? '',
  DAO_FACTORY: deploy.contracts?.daoFactory ?? '',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'], env });
const client = new Client({ name: 'dreamarena-check', version: '1.0.0' });
await client.connect(transport);

console.log('\nDreamArena MCP — check\n');

const { tools } = await client.listTools();
const expected = [
  'dreamarena_list_markets',
  'dreamarena_get_odds',
  'dreamarena_assess_risk',
  'dreamarena_get_streak',
  'dreamarena_get_balances',
  'dreamarena_list_arenas',
  'dreamarena_status',
  'dreamarena_place_bet',
];
const names = tools.map((t) => t.name);
check('tools registered', expected.every((t) => names.includes(t)), names.join(', '));

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content?.[0]?.text ?? '', isError: Boolean(r.isError) };
};

const status = await call('dreamarena_status');
check('status reads', !status.isError);

// The indexer transport is flaky over this testnet (intermittent connection
// errors), so the markets read retries like a real client would. Market reads
// are the only flaky leg — status is a direct RPC read.
let list = { text: '{}', isError: false };
const marketsInfo = { text: '' };
for (let attempt = 0; attempt < 4; attempt++) {
  list = await call('dreamarena_list_markets', { limit: 5 });
  try {
    marketsInfo.text = JSON.parse(list.text).markets ?? [];
    break;
  } catch {
    if (attempt === 3) marketsInfo.text = [];
    else await new Promise((r) => setTimeout(r, 1500));
  }
}
const markets = marketsInfo.text;
check('markets listed', markets.length > 0, `${markets.length} live`);

const balances = await call('dreamarena_get_balances', {
  address: '0x0D435dc067b0D367568F21805967815ecEA77FbA',
});
const bal = JSON.parse(balances.text);
check(
  'balances read',
  !balances.isError && typeof bal.tusdc === 'number' && typeof bal.stt === 'number',
  `tUSDC=${bal.tusdc} STT=${bal.stt}`,
);

const arenas = await call('dreamarena_list_arenas');
const arenaList = JSON.parse(arenas.text);
check('arenas read', !arenas.isError && Array.isArray(arenaList.arenas), `${arenaList.count} deployed`);

if (markets.length > 0) {
  const odds = await call('dreamarena_get_odds', { market: markets[0].marketId });
  const parsed = JSON.parse(odds.text);
  const priced = parsed.up?.price !== null || parsed.down?.price !== null;
  check('odds quoted', !odds.isError && priced, `up=${parsed.up?.price} down=${parsed.down?.price}`);

  const risk = await call('dreamarena_assess_risk', { market: markets[0].asset, direction: 'up' });
  const r = JSON.parse(risk.text);
  check('risk scored', r.riskScore >= 1 && r.riskScore <= 10, `score ${r.riskScore}`);
}

const unknown = await call('dreamarena_get_odds', { market: 'NOTANASSET' });
check('unknown market refused', unknown.isError);

// The safety property: no key means no writes, whatever the agent asks for.
if (!process.env.PRIVATE_KEY) {
  const bet = await call('dreamarena_place_bet', { market: 'BTC', direction: 'up', stake: 5 });
  check('read-only refuses to bet', bet.isError && /PRIVATE_KEY/.test(bet.text));
}

await client.close();
console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
