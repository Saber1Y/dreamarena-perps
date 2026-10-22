#!/usr/bin/env node
// DreamArena MCP server — lets an agent read and play the arcade.
//
// Reads work with no key. Writes need PRIVATE_KEY and are bounded by
// MAX_BET_TUSDC, enforced in the chain layer rather than in a prompt.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Address } from 'viem';
import {
  account,
  closeExchange,
  config,
  describe,
  findMarket,
  placeBet,
  runReadTool,
  type ArenaMarket,
  type ToolResult,
} from './arena.js';

const server = new McpServer({ name: 'dreamarena', version: '1.0.0' });

/** MCP tools return content blocks; JSON keeps the agent's parsing honest. */
const json = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const fail = (message: string) => ({
  content: [{ type: 'text' as const, text: message }],
  isError: true,
});

/** One read pipe for both the MCP surface and the in-app panel. */
const read = (result: ToolResult) => (result.ok ? json(result.content) : fail(result.error ?? 'Read failed.'));

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

server.registerTool(
  'dreamarena_list_markets',
  {
    title: 'List live markets',
    description:
      'List the DreamDEX binary markets currently open for trading, soonest to expire first. ' +
      'These are real rolling BTC/ETH series that mint a fresh market every 60s-5m.',
    inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ limit }) => read(await runReadTool('dreamarena_list_markets', { limit })),
);

server.registerTool(
  'dreamarena_get_odds',
  {
    title: 'Get market odds',
    description:
      'Read both sides of a market\'s order book. Prices are probabilities (0-1): a share bought ' +
      'at 0.40 costs 0.40 tUSDC and redeems for 1 tUSDC if that side wins.',
    inputSchema: {
      market: z.string().describe('A bytes32 marketId, or an asset symbol like "BTC" for the soonest market'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ market }) => read(await runReadTool('dreamarena_get_odds', { market })),
);

server.registerTool(
  'dreamarena_assess_risk',
  {
    title: 'Assess market risk',
    description:
      'Score one side of a market 1-10 from what the book actually shows: time to expiry, ' +
      'bid-ask spread, and how far the odds sit from a coin flip.',
    inputSchema: {
      market: z.string().describe('A bytes32 marketId, or an asset symbol like "BTC"'),
      direction: z.enum(['up', 'down']),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ market, direction }) =>
    read(await runReadTool('dreamarena_assess_risk', { market, direction })),
);

server.registerTool(
  'dreamarena_get_streak',
  {
    title: 'Get player streak',
    description:
      'Read a player\'s arcade record from ArcadeEngine: current win streak, multiplier, ' +
      'record, and the next milestone. The streak is consecutive wins, moved only by the ' +
      'oracle\'s own resolution.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .optional()
        .describe('Defaults to this server\'s own wallet'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ address }) => read(await runReadTool('dreamarena_get_streak', { address })),
);

server.registerTool(
  'dreamarena_get_balances',
  {
    title: 'Get wallet balances',
    description:
      'Read a wallet\'s spendable tUSDC and native STT (gas) on Somnia Shannon. ' +
      'tUSDC is the collateral every market settles in; STT pays the transaction fee.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .optional()
        .describe('Defaults to this server\'s own wallet'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ address }) => read(await runReadTool('dreamarena_get_balances', { address })),
);

server.registerTool(
  'dreamarena_list_arenas',
  {
    title: 'List arenas',
    description:
      'List every deployed arena (builder DAO) from the CommunityDAOFactory: its builder code, ' +
      'treasury, and the builder fee it earns on orders routed through it.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => read(await runReadTool('dreamarena_list_arenas')),
);

server.registerTool(
  'dreamarena_status',
  {
    title: 'Server status',
    description:
      'What this server is wired to and what it is allowed to do — network, contracts, ' +
      'whether a signer is loaded, and the per-bet cap.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => read(await runReadTool('dreamarena_status')),
);

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

server.registerTool(
  'dreamarena_place_bet',
  {
    title: 'Place a bet',
    description:
      'Place a REAL order on a live market, spending REAL testnet tUSDC, then record the entry ' +
      'with ArcadeEngine so it counts towards the streak. Confirm the stake with the user ' +
      'before calling. Capped per bet by the server; check dreamarena_status for the limit.',
    inputSchema: {
      market: z.string().describe('A bytes32 marketId, or an asset symbol like "BTC"'),
      direction: z.enum(['up', 'down']),
      stake: z.number().positive().describe('tUSDC to spend — this is the maximum loss'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
  async ({ market, direction, stake }) => {
    if (!account) return fail('No PRIVATE_KEY configured — this server is read-only.');
    const found = await findMarket(market);
    if (!found) return fail(`No live market matches "${market}".`);
    try {
      const outcome = await placeBet(found, direction === 'up', stake);
      return json({ market: describe(found), direction, ...outcome });
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'The bet failed.');
    }
  },
);

// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is the protocol channel — anything logged there corrupts it.
  console.error(
    `dreamarena-mcp ready · ${account ? `wallet ${account.address}` : 'read-only'} · ` +
      `cap ${config.maxBetTusdc} tUSDC`,
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await closeExchange().catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('dreamarena-mcp failed to start:', err);
  process.exit(1);
});
