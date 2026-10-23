import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/server/arena';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ rows: await getLeaderboard() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Leaderboard read failed.' }, { status: 502 });
  }
}
