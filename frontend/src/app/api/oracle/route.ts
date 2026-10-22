// The in-app Oracle panel's backend.
//
// This imports mcp-server/src/arena.ts — the SAME chain layer the DreamArena
// MCP server sits on — and dispatches the same tools by name. An agent and a
// player therefore drive identical read code, and the panel's tool log records
// the real MCP tool names with real latency.
//
// Reads need no key. Bets are deliberately NOT exposed here: placing one signs
// a real order, which belongs in the Arcade tab against the player's own
// wallet, not a transient server env.

import { NextRequest, NextResponse } from 'next/server';

// arena.ts reads its config from process.env at module load, with NEXT_PUBLIC_*
// fallbacks so both the MCP server and this route configure from one set of
// conventions. Import it as the single source of truth for tool behavior.
import { runReadTool, type ToolResult } from '../../../../../mcp-server/src/arena';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OracleRequest {
  tool?: string;
  args?: Record<string, unknown>;
}

async function dispatch(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (tool === 'dreamarena_place_bet') {
    // Same honesty as the read-only MCP server, honed deliberately: a panel
    // must not move money on the user's behalf via a server session key.
    return { ok: false, error: 'No PRIVATE_KEY configured — this server is read-only.' };
  }
  return runReadTool(tool, args);
}

export async function POST(req: NextRequest) {
  let body: OracleRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const tool = body.tool;
  if (!tool || typeof tool !== 'string') {
    return NextResponse.json({ ok: false, error: 'Missing "tool".' }, { status: 400 });
  }

  const started = performance.now();
  const result = await dispatch(tool, body.args ?? {});
  const ms = Math.round(performance.now() - started);

  return NextResponse.json({
    ok: result.ok,
    tool,
    ms,
    result: result.ok ? (result.content ?? undefined) : undefined,
    error: result.ok ? undefined : result.error,
  });
}

export async function GET() {
  const result = await runReadTool('dreamarena_status');
  return NextResponse.json({
    ok: result.ok,
    tool: 'dreamarena_status',
    result: result.ok ? result.content : undefined,
    error: result.ok ? undefined : result.error,
  });
}