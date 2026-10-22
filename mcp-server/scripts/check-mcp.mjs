// Drive the MCP server over stdio exactly as a client would.
// Run: npm run check  (after npm run build)
//
// Reads are asserted against the live Hideki testnet. Refusals are asserted
// without sending anything: a read-only server refuses every write, and a
// keyed server refuses orders outside its limits before they reach the chain.
//
// LIVE_TRADE=1 also runs a real cycle on the configured account (needs
// PRIVATE_KEY and, for a linked wallet, OWNER_ADDRESS): open a small ETH
// long, close half, close the rest, then rest a post-only bid far below the
// market and cancel it. It ends flat.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!ok) failures++;
};

async function start(env) {
  const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'], env: { ...process.env, ...env }, stderr: 'ignore' });
  const client = new Client({ name: 'dreamarena-perps-check', version: '2.0.0' });
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    const text = r.content?.[0]?.text ?? '';
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // error text, not JSON
    }
    return { text, data, isError: Boolean(r.isError) };
  };
  return { client, call };
}

console.log('\nDreamArena Perps MCP - check\n');

// --- Read-only server: reads work, every write refuses -----------------------
{
  const { client, call } = await start({ PRIVATE_KEY: '', OWNER_ADDRESS: process.env.OWNER_ADDRESS ?? '' });

  const { tools } = await client.listTools();
  const expected = [
    'dreamarena_status',
    'dreamarena_list_markets',
    'dreamarena_get_market',
    'dreamarena_get_account',
    'dreamarena_preview_order',
    'dreamarena_open_position',
    'dreamarena_close_position',
    'dreamarena_place_limit_order',
    'dreamarena_cancel_order',
  ];
  const names = tools.map((t) => t.name);
  check('tools registered', expected.every((t) => names.includes(t)) && names.length === expected.length, names.join(', '));

  const status = await call('dreamarena_status');
  check('status reads, read-only', !status.isError && status.data?.canTrade === false);

  const markets = await call('dreamarena_list_markets');
  check('markets listed', !markets.isError && markets.data?.count > 0, `${markets.data?.count} markets`);

  const eth = await call('dreamarena_get_market', { symbol: 'eth' });
  check(
    'live market read',
    !eth.isError && eth.data?.markPrice > 0 && eth.data?.bids?.length > 0 && eth.data?.asks?.length > 0,
    `ETH mark ${eth.data?.markPrice}, spread ${eth.data?.spreadBps} bps`,
  );

  const unknown = await call('dreamarena_get_market', { symbol: 'NOTACOIN' });
  check('unknown market refused', unknown.isError && /No perp market/.test(unknown.text));

  if (process.env.OWNER_ADDRESS) {
    const account = await call('dreamarena_get_account');
    check('account reads', !account.isError && typeof account.data?.equityUsdso === 'number', `equity ${account.data?.equityUsdso} USDso`);
  }

  const open = await call('dreamarena_open_position', { symbol: 'ETH', side: 'long', notionalUsdso: 20 });
  check('read-only refuses to trade', open.isError && /read-only/.test(open.text));
  const cancel = await call('dreamarena_cancel_order', { symbol: 'ETH', orderId: '1' });
  check('read-only refuses to cancel', cancel.isError && /read-only/.test(cancel.text));

  await client.close();
}

// --- Keyed server: limits refuse before anything is sent ---------------------
if (process.env.PRIVATE_KEY) {
  const { client, call } = await start({ MAX_ORDER_USDSO: '50', ALLOWED_MARKETS: 'ETH,BTC', MAX_LEVERAGE: '5' });

  const status = await call('dreamarena_status');
  check('keyed status', status.data?.canTrade === true, `trades ${status.data?.trades}`);

  const preview = await call('dreamarena_preview_order', { symbol: 'ETH', side: 'long', notionalUsdso: 20 });
  check(
    'preview within limits',
    !preview.isError && preview.data?.allowed === true && preview.data?.quantity > 0,
    `${preview.data?.quantity} ETH at ${preview.data?.limitPrice}, liq ${preview.data?.projectedLiquidationPrice}`,
  );

  const big = await call('dreamarena_open_position', { symbol: 'ETH', side: 'long', notionalUsdso: 60 });
  check('oversized order refused', big.isError && /per-order limit/.test(big.text));

  const doge = await call('dreamarena_open_position', { symbol: 'DOGE', side: 'long', notionalUsdso: 20 });
  check('market outside allowlist refused', doge.isError && /allowed markets/.test(doge.text));

  const tiny = await call('dreamarena_open_position', { symbol: 'ETH', side: 'long', notionalUsdso: 1 });
  check('below minimum size refused', tiny.isError && /minimum order/.test(tiny.text));

  const account = await call('dreamarena_get_account');
  const hasEth = account.data?.positions?.some((p) => p.symbol === 'ETH');
  if (!hasEth) {
    const nothing = await call('dreamarena_close_position', { symbol: 'ETH' });
    check('close with no position refused', nothing.isError && /no open ETH position/.test(nothing.text));
  }

  // --- Real cycle -------------------------------------------------------------
  if (process.env.LIVE_TRADE === '1') {
    if (hasEth) throw new Error('An ETH position is already open; close it before running the live cycle.');
    console.log('\n  live cycle on', status.data?.trades);
    let restingId = null;
    try {

    const opened = await call('dreamarena_open_position', { symbol: 'ETH', side: 'long', notionalUsdso: 20 });
    check('open long', !opened.isError && opened.data?.positionAfter?.side === 'long', opened.isError ? opened.text : `${opened.data.filled} ETH, ${opened.data.explorer}`);

    const mid = await call('dreamarena_get_account');
    const pos = mid.data?.positions?.find((p) => p.symbol === 'ETH');
    check('account shows the position', Boolean(pos) && pos.side === 'long', pos ? `size ${pos.size}, uPnL ${pos.unrealizedPnlUsdso}, liq ${pos.liquidationPrice}` : '');

    const half = await call('dreamarena_close_position', { symbol: 'ETH', percent: 50 });
    check(
      'close half',
      !half.isError && half.data?.positionAfter?.side === 'long' && half.data.positionAfter.size < (opened.data?.positionAfter?.size ?? 0),
      half.isError ? half.text : `left ${half.data.positionAfter.size} ETH, realized ${half.data.realizedPnlUsdso}, ${half.data.explorer}`,
    );

    const rest = await call('dreamarena_close_position', { symbol: 'ETH' });
    check('close the rest', !rest.isError && rest.data?.positionAfter?.side === 'flat', rest.isError ? rest.text : `realized ${rest.data.realizedPnlUsdso}, ${rest.data.explorer}`);

    const mark = (await call('dreamarena_get_market', { symbol: 'ETH' })).data?.markPrice;
    const bidPrice = Math.floor(mark * 0.7);
    const limit = await call('dreamarena_place_limit_order', { symbol: 'ETH', side: 'long', price: bidPrice, notionalUsdso: 20, postOnly: true });
    check(
      'post-only bid rests',
      !limit.isError && Boolean(limit.data?.restingOrderId) && limit.data?.positionAfter?.side === 'flat',
      limit.isError ? limit.text : `order ${limit.data.restingOrderId} at ${bidPrice}, ${limit.data.explorer}`,
    );

    restingId = limit.data?.restingOrderId ?? null;
    if (restingId) {
      const cancelled = await call('dreamarena_cancel_order', { symbol: 'ETH', orderId: restingId });
      check('cancel the bid', !cancelled.isError, cancelled.isError ? cancelled.text : cancelled.data.explorer);
      if (!cancelled.isError) restingId = null;
    }
    } finally {
      // Whatever failed above, leave the account as it was found.
      const left = await call('dreamarena_get_account');
      if (left.data?.positions?.some((p) => p.symbol === 'ETH')) await call('dreamarena_close_position', { symbol: 'ETH' });
      if (restingId) await call('dreamarena_cancel_order', { symbol: 'ETH', orderId: restingId });
    }

    const end = await call('dreamarena_get_account');
    check(
      'ends flat with no open orders',
      !end.data?.positions?.some((p) => p.symbol === 'ETH') && end.data?.openOrders?.length === 0,
      `equity ${end.data?.equityUsdso} USDso`,
    );
  }

  await client.close();
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
