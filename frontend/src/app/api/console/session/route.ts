import { NextResponse } from 'next/server';
import type { SessionView } from '@/lib/types';
import { bot, owner } from '@/server/chain';
import { consoleConfigured, isUnlocked, login, logout } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const view: SessionView = {
    configured: consoleConfigured(),
    unlocked: await isUnlocked(),
    owner,
    bot: bot?.address ?? null,
  };
  return NextResponse.json(view);
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: 'Cross-site requests are not accepted.' }, { status: 403 });
  }
  let passphrase: unknown;
  try {
    ({ passphrase } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
  if (typeof passphrase !== 'string' || passphrase.length === 0 || passphrase.length > 200) {
    return NextResponse.json({ error: 'Enter the console passphrase.' }, { status: 400 });
  }
  const result = await login(passphrase);
  return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: result.error }, { status: result.status });
}

export async function DELETE() {
  await logout();
  return NextResponse.json({ ok: true });
}
