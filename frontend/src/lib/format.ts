export const shortAddr = (a: string | null | undefined) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? ''));
export const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-6)}`;

export const EXPLORER = 'https://explorer.testnet.somnia.network/tokyo';
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrUrl = (address: string) => `${EXPLORER}/address/${address}`;

/** Prices: enough digits for a 0.004 PEPE and a 81,000 BTC alike. */
export function price(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 7;
  return v.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits });
}

export function usd(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Signed PnL; tiny values keep their sign and enough digits to be honest. */
export function pnl(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const abs = Math.abs(v);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : 2;
  const text = abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return v > 0 ? `+${text}` : v < 0 ? `−${text}` : text;
}

export const pnlTone = (v: number | null | undefined) =>
  v === null || v === undefined || v === 0 ? 'text-text-secondary' : v > 0 ? 'text-success' : 'text-danger';

export function countdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
