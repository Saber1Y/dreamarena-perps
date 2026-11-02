import { NextRequest, NextResponse } from 'next/server';
import { getAddress, isAddress } from 'viem';
import { accountView, getPlayerAccount } from '../../../../../../mcp-server/src/perps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Any player's dreamDEX perps account: equity and positions, read from chain. */
export async function GET(req: NextRequest) {
  const player = req.nextUrl.searchParams.get('player');
  if (!player || !isAddress(player)) return NextResponse.json({ error: 'player must be an address.' }, { status: 400 });
  try {
    const account = await getPlayerAccount(getAddress(player));
    return NextResponse.json({ ...accountView(account), openOrders: null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Account read failed.' }, { status: 502 });
  }
}
