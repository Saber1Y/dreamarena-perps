import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

// The console's actions trade a real wallet through the linked bot, so they
// sit behind a passphrase. A session is an HMAC-signed expiry in an
// HttpOnly, SameSite=Strict cookie; changing the passphrase ends every session.

const COOKIE = 'dreamarena_console';
const TTL_SECONDS = 12 * 60 * 60;
const MIN_PASSPHRASE = 12;

function passphrase(): string | null {
  const value = process.env.CONSOLE_PASSPHRASE;
  return value && value.length >= MIN_PASSPHRASE ? value : null;
}

/** Actions need a passphrase of at least MIN_PASSPHRASE characters. */
export const consoleConfigured = () => passphrase() !== null && Boolean(process.env.PRIVATE_KEY && process.env.OWNER_ADDRESS);

function key(): Buffer {
  return createHash('sha256').update(`dreamarena-console:${passphrase()}`).digest();
}

const sign = (expiry: number) => createHmac('sha256', key()).update(String(expiry)).digest('base64url');

function equal(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

// Ten attempts per address per ten minutes, in memory: enough to stop guessing
// against a single deployment.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

export async function login(candidate: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const expected = passphrase();
  if (!expected || !consoleConfigured()) return { ok: false, error: 'The console is not configured on this deployment.', status: 503 };

  const who = await clientKey();
  const now = Date.now();
  const entry = attempts.get(who);
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts. Try again in a few minutes.', status: 429 };
  }
  if (!equal(candidate, expected)) {
    attempts.set(who, entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
    return { ok: false, error: 'That passphrase is not right.', status: 401 };
  }
  attempts.delete(who);

  const expiry = Math.floor(now / 1000) + TTL_SECONDS;
  const jar = await cookies();
  jar.set(COOKIE, `${expiry}.${sign(expiry)}`, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  });
  return { ok: true };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isUnlocked(): Promise<boolean> {
  if (!consoleConfigured()) return false;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return false;
  const [expiryText, mac] = value.split('.');
  const expiry = Number(expiryText);
  if (!Number.isInteger(expiry) || expiry < Date.now() / 1000 || !mac) return false;
  return equal(mac, sign(expiry));
}

/** A state-changing request must come from this site and carry a live session. */
export async function requireSession(request: Request): Promise<string | null> {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) return 'Cross-site requests are not accepted.';
  if (!(await isUnlocked())) return 'Unlock the console first.';
  return null;
}
