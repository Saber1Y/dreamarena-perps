import { NextResponse } from 'next/server';
import { execute, planClose, planOpen } from '../../../../../../mcp-server/src/perps';
import type { Execution } from '@/lib/types';
import { requireSession } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// An order or a run transaction takes 10 to 20 seconds to confirm on this testnet.
export const maxDuration = 60;

// Orders go through the perps agent's own planner and limits: the same code
// path, allowlist, size, leverage and loss limits as the MCP server.

interface TradeRequest {
  action?: unknown;
  symbol?: unknown;
  side?: unknown;
  notionalUsdso?: unknown;
  percent?: unknown;
}

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  let body: TradeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  if (!/^[A-Za-z0-9]{1,16}$/.test(symbol)) return NextResponse.json({ error: 'Pick a market.' }, { status: 400 });

  try {
    let plan;
    if (body.action === 'open') {
      if (body.side !== 'long' && body.side !== 'short') return NextResponse.json({ error: 'Pick long or short.' }, { status: 400 });
      const notional = Number(body.notionalUsdso);
      if (!Number.isFinite(notional) || notional <= 0) return NextResponse.json({ error: 'Enter a size in USDso.' }, { status: 400 });
      plan = await planOpen(symbol, body.side, notional);
    } else if (body.action === 'close') {
      const percent = body.percent === undefined ? 100 : Number(body.percent);
      plan = await planClose(symbol, percent);
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    if (plan.refusal) return NextResponse.json({ error: plan.refusal, refused: true }, { status: 422 });

    const done = await execute(plan);
    const result: Execution = {
      txHash: done.txHash,
      explorer: done.explorer,
      gasUsed: done.gasUsed,
      filled: done.filled,
      positionAfter: done.positionAfter,
      realizedPnlUsdso: done.realizedPnlUsdso,
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'The order failed.' }, { status: 502 });
  }
}
