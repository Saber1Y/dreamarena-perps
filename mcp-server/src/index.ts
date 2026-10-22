#!/usr/bin/env node
// DreamArena Perps MCP server: lets an agent read dreamDEX perps and trade a
// wallet that linked it with Link a Bot.
//
// Reads work with no key. Writes need PRIVATE_KEY (the linked bot key) and
// pass the limits in limits.ts, enforced in the order path rather than in a
// prompt. Closing is always allowed; it is how the agent gets out of trouble.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  bot,
  cancelOrder,
  closeExchange,
  config,
  execute,
  owner,
  planClose,
  planLimit,
  planOpen,
  runReadTool,
  type OrderPlan,
  type ToolResult,
} from './perps.js';

const server = new McpServer({ name: 'dreamarena-perps', version: '2.0.0' });

/** MCP tools return content blocks; JSON keeps the agent's parsing honest. */
const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const fail = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

/** One read pipe for both the MCP surface and the in-app panel. */
const read = (result: ToolResult) => (result.ok ? json(result.content) : fail(result.error));

const symbol = z.string().min(1).describe('Base symbol of the perp market, like "ETH" or "BTC"');
const side = z.enum(['long', 'short']);
const notionalUsdso = z.number().positive().describe('Order size in USDso of notional (size times price), not margin');

/** Plan, refuse if a limit says so, otherwise execute. */
async function trade(plan: () => Promise<OrderPlan>) {
  if (!bot) return fail('No PRIVATE_KEY configured, so this server is read-only.');
  try {
    const planned = await plan();
    if (planned.refusal) return fail(`Refused by the agent's limits: ${planned.refusal}`);
    return json(await execute(planned));
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'The order failed.');
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

server.registerTool(
  'dreamarena_status',
  {
    title: 'Agent status',
    description:
      'What this agent is wired to and allowed to do: the network, the account it trades, ' +
      'whether it can sign, and its limits (allowed markets, per-order size, leverage, loss limit).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => read(await runReadTool('dreamarena_status')),
);

server.registerTool(
  'dreamarena_list_markets',
  {
    title: 'List perp markets',
    description:
      'Every dreamDEX perp market on testnet with its max leverage, funding rate, open interest and ' +
      'whether this agent may open positions in it. Prices here are indexer snapshots; use ' +
      'dreamarena_get_market for the live mark and book.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => read(await runReadTool('dreamarena_list_markets')),
);

server.registerTool(
  'dreamarena_get_market',
  {
    title: 'Get a market',
    description: "One market's live on-chain mark price, spread, and the top five levels of each side of the book.",
    inputSchema: { symbol },
    annotations: { readOnlyHint: true },
  },
  async (args) => read(await runReadTool('dreamarena_get_market', args)),
);

server.registerTool(
  'dreamarena_get_account',
  {
    title: 'Get the account',
    description:
      'The traded account: equity, account leverage, open positions with entry, mark, unrealized PnL and ' +
      'liquidation price, open orders, and whether the loss limit has switched it to reduce-only.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => read(await runReadTool('dreamarena_get_account')),
);

server.registerTool(
  'dreamarena_preview_order',
  {
    title: 'Preview an order',
    description:
      'Dry-run a market order without sending it: the size, the price it would carry, the projected ' +
      'account leverage and liquidation price, and whether the agent limits allow it.',
    inputSchema: { symbol, side, notionalUsdso },
    annotations: { readOnlyHint: true },
  },
  async (args) => read(await runReadTool('dreamarena_preview_order', args)),
);

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

server.registerTool(
  'dreamarena_open_position',
  {
    title: 'Open or add to a position',
    description:
      'Send a REAL market (immediate-or-cancel) order that opens or adds to a long or short. It refuses to ' +
      'flip an opposite position, and refuses anything outside the agent limits. Confirm size and side with ' +
      'the user first; preview with dreamarena_preview_order.',
    inputSchema: { symbol, side, notionalUsdso },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ symbol, side, notionalUsdso }) => trade(() => planOpen(symbol, side, notionalUsdso)),
);

server.registerTool(
  'dreamarena_close_position',
  {
    title: 'Close a position',
    description:
      'Send a REAL market order that closes some or all of an open position. It can only shrink the ' +
      'position, so it is always allowed, even past the loss limit.',
    inputSchema: {
      symbol,
      percent: z.number().gt(0).max(100).optional().describe('Share of the position to close, default 100'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ symbol, percent }) => trade(() => planClose(symbol, percent ?? 100)),
);

server.registerTool(
  'dreamarena_place_limit_order',
  {
    title: 'Place a limit order',
    description:
      'Rest a REAL limit order on the book. It counts as adding exposure, so every agent limit applies. ' +
      'postOnly makes sure it never takes liquidity. Returns the order id for dreamarena_cancel_order.',
    inputSchema: {
      symbol,
      side,
      price: z.number().positive().describe('Limit price in USDso per whole base unit'),
      notionalUsdso,
      postOnly: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ symbol, side, price, notionalUsdso, postOnly }) =>
    trade(() => planLimit(symbol, side, price, notionalUsdso, postOnly ?? false)),
);

server.registerTool(
  'dreamarena_cancel_order',
  {
    title: 'Cancel an order',
    description: 'Cancel one resting order by its numeric id (from dreamarena_get_account or dreamarena_place_limit_order).',
    inputSchema: { symbol, orderId: z.string().regex(/^\d+$/) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ symbol, orderId }) => {
    if (!bot) return fail('No PRIVATE_KEY configured, so this server is read-only.');
    try {
      return json(await cancelOrder(symbol, orderId));
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'The cancel failed.');
    }
  },
);

// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the protocol channel; anything logged there corrupts it.
  const limits = config.limits;
  console.error(
    `dreamarena-perps-mcp ready · ${bot ? `signer ${bot.address}` : 'read-only'} · trades ${owner ?? 'nothing'} · ` +
      `markets ${limits.markets.join(',')} · max order ${limits.maxOrderUsdso} USDso · max ${limits.maxLeverage}x · loss limit ${limits.maxLossUsdso} USDso`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await closeExchange().catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('dreamarena-perps-mcp failed to start:', err);
  process.exit(1);
});
