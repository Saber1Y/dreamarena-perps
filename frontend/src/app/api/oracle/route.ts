// The in-app agent panel's backend.
//
// This imports mcp-server/src/perps.ts, the same chain layer the DreamArena
// Perps MCP server sits on, and dispatches the same read tools by name. An
// agent and a player therefore drive identical read code, and the panel's tool
// log records the real MCP tool names with real latency.
//
// Only reads are reachable: runReadTool answers nothing else. Orders sign with
// the player's own wallet or the agent's own key, never a web server's env.

import { NextRequest, NextResponse } from 'next/server';
import { runReadTool } from '../../../../../mcp-server/src/perps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OracleRequest {
  tool?: string;
  args?: Record<string, unknown>;
}

const dispatch = (tool: string, args: Record<string, unknown>) => runReadTool(tool, args);

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