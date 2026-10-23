'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Play, ShieldCheck, Terminal } from 'lucide-react';
import { callTool, useAgentStatus, useSession } from '@/hooks/api';
import { addrUrl, shortAddr } from '@/lib/format';

interface ToolDef {
  name: string;
  label: string;
  args?: 'symbol' | 'preview';
}

const READ_TOOLS: ToolDef[] = [
  { name: 'dreamarena_status', label: 'Status' },
  { name: 'dreamarena_list_markets', label: 'List markets' },
  { name: 'dreamarena_get_market', label: 'Get market', args: 'symbol' },
  { name: 'dreamarena_get_account', label: 'Get account' },
  { name: 'dreamarena_preview_order', label: 'Preview order', args: 'preview' },
];

const WRITE_TOOLS = [
  'dreamarena_open_position',
  'dreamarena_close_position',
  'dreamarena_place_limit_order',
  'dreamarena_cancel_order',
];

interface LogEntry {
  id: number;
  tool: string;
  ok: boolean;
  ms: number;
  body: string;
}

const MCP_SNIPPET = `{
  "mcpServers": {
    "dreamarena-perps": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "<your linked bot key>",
        "OWNER_ADDRESS": "<your Perps Arena wallet>",
        "ALLOWED_MARKETS": "BTC,ETH,SOL",
        "MAX_ORDER_USDSO": "100",
        "MAX_LEVERAGE": "5",
        "MAX_LOSS_USDSO": "100"
      }
    }
  }
}`;

let seq = 0;

export function AgentTab() {
  const status = useAgentStatus();
  const session = useSession();
  const [tool, setTool] = useState<ToolDef>(READ_TOOLS[2]);
  const [symbol, setSymbol] = useState('ETH');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [notional, setNotional] = useState('25');
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    const args =
      tool.args === 'symbol' ? { symbol } : tool.args === 'preview' ? { symbol, side, notionalUsdso: Number(notional) } : {};
    const started = performance.now();
    try {
      const call = await callTool<unknown>(tool.name, args);
      setLog((l) => [
        { id: seq++, tool: tool.name, ok: call.ok, ms: call.ms ?? Math.round(performance.now() - started), body: call.ok ? JSON.stringify(call.result, null, 2) : (call.error ?? 'Failed') },
        ...l,
      ].slice(0, 12));
    } catch (err) {
      setLog((l) => [{ id: seq++, tool: tool.name, ok: false, ms: Math.round(performance.now() - started), body: err instanceof Error ? err.message : 'Failed' }, ...l]);
    } finally {
      setRunning(false);
    }
  };

  const s = status.data;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="space-y-5">
        <section className="surface p-5" aria-label="Agent">
          <div className="flex items-center gap-2">
            <span className="tint-primary flex h-9 w-9 items-center justify-center rounded-xl text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold leading-tight">The perps agent</h2>
              <p className="text-xs text-text-muted">An MCP server. This app trades through the same code.</p>
            </div>
          </div>
          {!s && <div className="skeleton mt-4 h-32 w-full" />}
          {s && (
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Trades</dt>
                <dd className="num">
                  <a href={addrUrl(s.trades)} target="_blank" rel="noopener noreferrer" className="hover:text-primary">{shortAddr(s.trades)}</a>
                  {s.linkedWallet && <span className="badge-primary ml-2">linked wallet</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Signs as</dt>
                <dd className="num">{s.canTrade ? shortAddr(s.signer) : 'read-only'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Markets it may open</dt>
                <dd className="num">{s.limits.markets.join(', ')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Largest order</dt>
                <dd className="num">{s.limits.maxOrderUsdso} USDso</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Max account leverage</dt>
                <dd className="num">{s.limits.maxLeverage}x</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-muted">Reduce-only after a loss of</dt>
                <dd className="num">{s.limits.maxLossUsdso} USDso</dd>
              </div>
            </dl>
          )}
          <p className="mt-4 border-t border-border pt-3 text-xs text-text-muted">
            Limits run in the order path, not the prompt, so an agent cannot talk itself past them. Closing is always allowed. The bot key came from dreamDEX Link a Bot: it can place, cancel and reduce orders, never withdraw.
          </p>
        </section>

        <section className="surface p-5" aria-label="Connect to Claude">
          <h2 className="text-lg font-semibold">Use it from Claude</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Build the server, then add this to your MCP client. Writes: {WRITE_TOOLS.map((t) => t.replace('dreamarena_', '')).join(', ')}.
          </p>
          <div className="relative mt-3">
            <pre className="num max-h-72 overflow-auto rounded-xl bg-text-primary p-4 text-[11px] leading-relaxed text-background">{MCP_SNIPPET}</pre>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(MCP_SNIPPET);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[11px] font-semibold text-text-primary"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {session.data && !session.data.configured && (
            <p className="mt-2 text-xs text-text-muted">This deployment has no bot key, so its own reads are all it can do.</p>
          )}
        </section>
      </div>

      <section className="surface flex min-h-[520px] flex-col p-5" aria-label="Tool runner">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Call the agent&apos;s tools</h2>
        </div>
        <p className="mt-1 text-sm text-text-secondary">Real calls, live latency. The same dispatcher the MCP server registers.</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {READ_TOOLS.map((t) => (
            <button
              key={t.name}
              onClick={() => setTool(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${t.name === tool.name ? 'bg-text-primary text-background' : 'bg-elevated text-text-secondary hover:text-text-primary'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          {tool.args && (
            <label className="w-24">
              <span className="eyebrow mb-1 block">Symbol</span>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} className="input num" />
            </label>
          )}
          {tool.args === 'preview' && (
            <>
              <label className="w-28">
                <span className="eyebrow mb-1 block">Side</span>
                <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')} className="input">
                  <option value="long">long</option>
                  <option value="short">short</option>
                </select>
              </label>
              <label className="w-28">
                <span className="eyebrow mb-1 block">USDso</span>
                <input value={notional} onChange={(e) => setNotional(e.target.value.replace(/[^0-9.]/g, ''))} className="input num" inputMode="decimal" />
              </label>
            </>
          )}
          <button onClick={run} disabled={running} className="btn-primary">
            <Play className="h-4 w-4" /> {running ? 'Calling…' : tool.name}
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-hidden">
          {log.length === 0 && (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border-default text-center text-xs text-text-muted">
              Call a tool to see exactly what an agent sees.
            </div>
          )}
          <AnimatePresence initial={false}>
            {log.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-xl border border-border"
              >
                <div className="flex items-center justify-between bg-elevated px-3 py-1.5 text-[11px]">
                  <span className="num font-semibold">{entry.tool}</span>
                  <span className={`num ${entry.ok ? 'text-success' : 'text-danger'}`}>
                    {entry.ok ? 'ok' : 'error'} · {entry.ms} ms
                  </span>
                </div>
                <pre className="num max-h-64 overflow-auto px-3 py-2 text-[11px] leading-relaxed text-text-secondary">{entry.body}</pre>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}
