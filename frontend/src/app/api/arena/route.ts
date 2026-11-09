import { NextRequest, NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';
import { getArenaAndPlayer } from '@/server/arena';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Arena-wide state, plus one player's run and stats when asked for. */
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get('player');
  if (requested && !isAddress(requested)) {
    return NextResponse.json({ error: 'player must be an address.' }, { status: 400 });
  }
  const player = requested ? getAddress(requested) : null;
  try {
    return NextResponse.json(await getArenaAndPlayer(player));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Arena read failed.' }, { status: 502 });
  }
}
