import { NextResponse } from 'next/server';
import { getFeed } from '@/server/arena';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getFeed());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Feed read failed.' }, { status: 502 });
  }
}
