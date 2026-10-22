'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ExternalLink, Radio, AlertCircle } from 'lucide-react';
import { parseAbiItem, type Address, type Hex } from 'viem';
import { publicClient } from '@/lib/dreamdex';
import { CONTRACTS } from '@/lib/web3';
import { useSettlements, useOracleCallbacks } from '@/hooks/useSettlements';

const ENGINE = CONTRACTS.arcadeEngine as Address;
const ORACLE_HUB = CONTRACTS.oracleHub as Address;
const PRECOMPILE = '0x0000000000000000000000000000000000000100';

/** OracleHub's AnswerDelivered — the log the engine's subscription is keyed on. */
const ANSWER_DELIVERED = parseAbiItem(
  'event AnswerDelivered(uint256 indexed oracleQuestionId, bytes32 indexed marketId, uint32 payoutDenominator, uint256[] payoutNumerators, bool voided)',
);

interface Trace {
  marketId: Hex;
  block: bigint;
  oracleTx: Hex | null;
  engineTx: Hex;
  /** True when the oracle's answer and our handler landed in the SAME block. */
  sameBlock: boolean;
}

const tx = (h: string) => `https://shannon-explorer.somnia.network/tx/${h}`;
const addr = (a: string) => `https://shannon-explorer.somnia.network/address/${a}`;

/**
 * The Reactive Settlement Monitor.
 *
 * The claim "settled in the same block, with no keeper" is easy to write and
 * hard to believe, so this verifies it against the chain instead of asserting
 * it: take a real settlement, find the OracleHub's AnswerDelivered log in the
 * same block, and show that our handler ran there too — with both transactions
 * linked so anyone can check.
 */
export function ReactivityProof() {
  const { settlements } = useSettlements(5);
  const { pulses } = useOracleCallbacks(12);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [checking, setChecking] = useState(false);

  const latest = settlements[0];

  useEffect(() => {
    if (!latest) return;
    let active = true;
    setChecking(true);

    (async () => {
      try {
        // Look for the oracle's answer for this market in the very block our
        // engine emitted its resolution.
        const logs = await publicClient.getLogs({
          address: ORACLE_HUB,
          event: ANSWER_DELIVERED,
          args: { marketId: latest.marketId },
          fromBlock: latest.blockNumber,
          toBlock: latest.blockNumber,
        });

        if (!active) return;
        setTrace({
          marketId: latest.marketId,
          block: latest.blockNumber,
          oracleTx: (logs[0]?.transactionHash as Hex) ?? null,
          engineTx: latest.txHash as Hex,
          sameBlock: logs.length > 0,
        });
      } catch {
        if (active) setTrace(null);
      } finally {
        if (active) setChecking(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [latest]);

  return (
    <div className="surface overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-sm">Reactive Settlement Monitor</h3>
        <span className="text-xs text-text-muted ml-auto">
          {checking ? 'Verifying…' : trace ? `block #${trace.block}` : 'awaiting a settlement'}
        </span>
      </div>

      {/* Always-on evidence: these arrive whether or not anyone is playing. */}
      {pulses.length > 0 && (
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-baseline gap-2 mb-3 flex-wrap">
            <span className="text-2xl font-bold tabular-nums text-primary">{pulses.length}</span>
            <span className="text-sm text-text-secondary">
              callbacks the chain has pushed to us recently
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {pulses.map((p) => (
              <a
                key={`${p.marketId}:${p.txHash}`}
                href={tx(p.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                title={`market …${p.marketId.slice(-6)} · block ${p.blockNumber} · ${p.entrantCount} entrant(s)`}
                className="font-mono text-[10px] px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                …{p.marketId.slice(-4)}
              </a>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-3">
            Nobody triggered these. Each one is the precompile invoking
            <span className="font-mono"> onEvent</span> on our contract in the block its
            market&apos;s oracle answered.
          </p>
        </div>
      )}

      <div className="p-6">
        <ol className="space-y-0">
          <Step
            index={1}
            title="You take a side"
            detail="A real taker order fills on the market's own DreamDEX book."
          />
          <Step
            index={2}
            title="The market expires"
            detail="OracleHub resolves it and emits AnswerDelivered."
            href={trace?.oracleTx ? tx(trace.oracleTx) : addr(ORACLE_HUB)}
            linkLabel={trace?.oracleTx ? 'oracle tx' : 'OracleHub'}
          />
          <Step
            index={3}
            title="The precompile dispatches"
            detail="Somnia's reactivity precompile at 0x0100 calls our subscription's handler."
            href={addr(PRECOMPILE)}
            linkLabel="0x…0100"
          />
          <Step
            index={4}
            title="Your streak moves"
            detail="ArcadeEngine.onEvent resolves the market's entries and emits GameResolved."
            href={trace?.engineTx ? tx(trace.engineTx) : ENGINE ? addr(ENGINE) : undefined}
            linkLabel={trace?.engineTx ? 'handler tx' : 'ArcadeEngine'}
            last
          />
        </ol>

        {trace ? (
          <div
            className={`mt-6 flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
              trace.sameBlock
                ? 'bg-success/10 border-success/20 text-success'
                : 'bg-warning/10 border-warning/20 text-warning'
            }`}
          >
            {trace.sameBlock ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div>
              {trace.sameBlock ? (
                <>
                  <span className="font-medium">
                    Verified: the oracle&apos;s answer and our handler both landed in block #
                    {trace.block.toString()}.
                  </span>{' '}
                  <span className="opacity-80">
                    No keeper, no cron, no backend — the chain pushed the result.
                  </span>
                </>
              ) : (
                <>
                  Settled in block #{trace.block.toString()}, but the oracle log for this market
                  was not found in that block. It may have resolved through the tail sweep rather
                  than the reactive callback.
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-text-muted">
            Place a bet and let it expire. The moment it settles, this traces the actual
            transactions and checks whether the oracle and our handler shared a block.
          </p>
        )}
      </div>
    </div>
  );
}

function Step({
  index,
  title,
  detail,
  href,
  linkLabel,
  last,
}: {
  index: number;
  title: string;
  detail: string;
  href?: string;
  linkLabel?: string;
  last?: boolean;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06 }}
      className="flex gap-4"
    >
      <div className="flex flex-col items-center">
        <span className="w-7 h-7 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
          {index}
        </span>
        {!last && <span className="w-px flex-1 bg-border my-1" />}
      </div>
      <div className={last ? 'pb-0' : 'pb-5'}>
        <div className="font-medium text-sm">{title}</div>
        <p className="text-sm text-text-muted mt-0.5">{detail}</p>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1.5"
          >
            {linkLabel} <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.li>
  );
}
