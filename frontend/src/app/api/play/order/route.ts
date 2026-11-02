import { NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { checkCapacity, orderTransaction, planClose, planOpen, previewPlan } from '../../../../../../mcp-server/src/perps';
import type { OrderTx, PreviewView } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A player trading their own wallet: the server plans the order with the same
// code the agent uses (book, tick, lot, slippage), checks dreamDEX's own margin
// limit for that account, and hands back the `placeOrder` transaction. The
// player's wallet signs and sends it; this server never holds their key.
// Nothing here can move funds, so it needs no session.

interface OrderRequest {
  player?: unknown;
  action?: unknown;
  symbol?: unknown;
  side?: unknown;
  notionalUsdso?: unknown;
  percent?: unknown;
  /** Preview only: what the ticket shows before the player commits. */
  dryRun?: unknown;
}

export async function POST(req: Request) {
  let body: OrderRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (typeof body.player !== 'string' || !isAddress(body.player)) {
    return NextResponse.json({ error: 'Connect a wallet first.' }, { status: 400 });
  }
  const player = getAddress(body.player);
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  if (!/^[A-Za-z0-9]{1,16}$/.test(symbol)) return NextResponse.json({ error: 'Pick a market.' }, { status: 400 });

  try {
    let plan;
    if (body.action === 'open') {
      if (body.side !== 'long' && body.side !== 'short') return NextResponse.json({ error: 'Pick long or short.' }, { status: 400 });
      const notional = Number(body.notionalUsdso);
      if (!Number.isFinite(notional) || notional <= 0) return NextResponse.json({ error: 'Enter a size in USDso.' }, { status: 400 });
      plan = await planOpen(symbol, body.side, notional, { player });
    } else if (body.action === 'close') {
      const percent = body.percent === undefined ? 100 : Number(body.percent);
      plan = await planClose(symbol, percent, { player });
    } else {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const preview: PreviewView = await previewPlan(plan);
    const capacity =
      plan.account.equityUsdso <= 0 && !plan.reducing
        ? "This wallet has no USDso margin on dreamDEX yet. Join dreamDEX's Perps Arena for 1,000 paper USDso, then trade here."
        : await checkCapacity(plan).then(
            () => null,
            (err: unknown) => (err instanceof Error ? err.message : 'The account cannot take this order.'),
          );
    if (capacity) Object.assign(preview, { allowed: false, refusal: capacity });
    // With no margin there is no position to liquidate; a price would mislead.
    if (plan.account.equityUsdso <= 0) preview.projectedLiquidationPrice = null;
    if (body.dryRun === true) return NextResponse.json(preview);
    if (capacity) return NextResponse.json({ error: capacity }, { status: 422 });

    const tx = orderTransaction(plan);
    const sizeBefore = plan.account.positions.find((p) => p.symbol === plan.market.symbol)?.sizeRaw ?? 0n;
    const result: OrderTx = {
      to: tx.to,
      data: tx.data,
      gas: tx.gas.toString(),
      symbol: plan.market.symbol,
      pool: plan.market.pool,
      baseDecimals: plan.market.baseDecimals,
      sizeBefore: sizeBefore.toString(),
      preview,
    };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not plan the order.' }, { status: 422 });
  }
}
