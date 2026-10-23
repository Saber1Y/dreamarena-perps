import { NextResponse } from 'next/server';
import { getFeed } from '@/server/arena';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A cold instance reads up to an hour of blocks, 1,000 per request.
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getFeed());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Feed read failed.' }, { status: 502 });
  }
}
