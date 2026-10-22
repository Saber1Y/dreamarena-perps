'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Zap, Gamepad2, CircuitBoard, GitFork, XCircle, Lock,
  Flame, Repeat, Trophy, Check
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const CANVAS_W = 1380;
const CANVAS_H = 620;

const NODE_W = 132;
const NODE_H = 68;

type Tone = 'success' | 'primary' | 'warning' | 'neutral';

const TINTS: Record<Tone, {
  chip: string;
  hex: string;
  glow: string;
}> = {
  success: { chip: 'bg-success/10 text-success', hex: '#22c55e', glow: 'rgba(34,197,94,0.30)' },
  primary: { chip: 'bg-primary/10 text-primary', hex: '#8e47ff', glow: 'rgba(142,71,255,0.26)' },
  warning: { chip: 'bg-warning/10 text-warning', hex: '#d97706', glow: 'rgba(217,119,6,0.20)' },
  neutral: { chip: 'bg-elevated text-text-secondary', hex: '#9b9489', glow: 'rgba(155,148,137,0.16)' },
};

interface NodeSpec {
  id: string;
  x: number;
  y: number;
  icon: LucideIcon;
  tone: Tone;
  label: string;
}

/*
 * Cyclic topology - the bet loop, not a linear chain.
 * Bet flows clockwise around the canvas; "Roll forward" arcs back to the start,
 * so streak-compounding reads as a real, recurring cycle.
 * Canvas 1380 x 620.
 */
const NODES: NodeSpec[] = [
  { id: 'n1', x: 120, y: 90,  icon: Zap,         tone: 'success', label: 'Bet request' },
  { id: 'n2', x: 120, y: 390, icon: Gamepad2,    tone: 'primary', label: 'ArcadeEngine' },
  { id: 'n3', x: 430, y: 470, icon: CircuitBoard, tone: 'neutral', label: 'Price signal' },
  { id: 'n4', x: 740, y: 430, icon: GitFork,     tone: 'primary', label: 'Correct?' },
  { id: 'n6', x: 880, y: 100, icon: Lock,        tone: 'primary', label: 'Payout gate' },
  { id: 'n8', x: 560, y: 60,  icon: Repeat,      tone: 'success', label: 'Roll forward' },
  { id: 'n7', x: 1020, y: 250, icon: Flame,      tone: 'primary', label: 'Streaks & Bosses' },
  { id: 'n9', x: 1020, y: 480, icon: Trophy,     tone: 'neutral', label: 'Leaderboard' },
  { id: 'n5', x: 430, y: 250, icon: XCircle,     tone: 'neutral', label: 'Bet settled: loss' },
];

/* Center of each card = (x + 66, y + 34) */
const C: Record<string, [number, number]> = Object.fromEntries(
  NODES.map((n) => [n.id, [n.x + NODE_W / 2, n.y + NODE_H / 2]])
) as Record<string, [number, number]>;

interface PathSpec {
  id: string;
  d: string;
  color: string;
  label?: { text: string; color: string; x: number; y: number };
}

const ANCHOR = 'rgba(31,27,22,0.35)';
const GREEN = '#16a34a';
const RED = '#dc2626';
const PURPLE = '#8e47ff';

const [c1, c2, c3, c4, c5, c6, c7, c8, c9] = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'].map((id) => C[id]);

const PATHS: PathSpec[] = [
  // Main clockwise loop ----------
  // n1 -> n2 (down the left edge)
  { id: 'p1', d: `M ${c1[0]} ${c1[1]} C ${c1[0]} ${c2[1] - 170} ${c2[0]} ${c2[1] - 170} ${c2[0]} ${c2[1]}`, color: ANCHOR },
  // n2 -> n3
  { id: 'p2', d: `M ${c2[0]} ${c2[1]} C 320 521 ${c3[0] - 120} 526 ${c3[0]} ${c3[1]}`, color: ANCHOR },
  // n3 -> n4
  { id: 'p3', d: `M ${c3[0]} ${c3[1]} C 660 521 700 470 ${c4[0]} ${c4[1]}`, color: ANCHOR },
  // n4 -> n6 (Yes)
  { id: 'p4', d: `M ${c4[0]} ${c4[1]} C 880 350 910 230 ${c6[0]} ${c6[1]}`, color: GREEN,
    label: { text: 'Yes', color: GREEN, x: 894, y: 330 } },
  // n6 -> n8 (top short hop)
  { id: 'p7', d: `M ${c6[0]} ${c6[1]} C 820 122 700 86 ${c8[0]} ${c8[1]}`, color: ANCHOR },
  // n8 -> n1 — THE LOOP: arcs across the top back into the start
  { id: 'p9', d: `M ${c8[0]} ${c8[1]} C 520 6 240 20 ${c1[0]} ${c1[1]}`, color: PURPLE,
    label: { text: 'streak++', color: PURPLE, x: 370, y: 18 } },

  // Branch terminals ----------
  // n4 -> n5 (No)
  { id: 'p5', d: `M ${c4[0]} ${c4[1]} C 730 360 560 330 ${c5[0]} ${c5[1]}`, color: RED,
    label: { text: 'No', color: RED, x: 640, y: 336 } },
  // n7 -> n6 (streak input into the gate)
  { id: 'p6', d: `M ${c7[0]} ${c7[1]} C 1030 200 960 160 ${c6[0]} ${c6[1]}`, color: PURPLE,
    label: { text: 'streak', color: PURPLE, x: 1032, y: 200 } },
  // n6 -> n9 (leaderboard record)
  { id: 'p8', d: `M ${c6[0]} ${c6[1]} C 1140 220 1100 430 ${c9[0]} ${c9[1]}`, color: ANCHOR },
];

const ARROW_IDS: Record<string, string> = {
  [ANCHOR]: 'arr-neutral',
  [GREEN]: 'arr-green',
  [RED]: 'arr-red',
  [PURPLE]: 'arr-purple',
};

function arrowColor(key: string) {
  return key === GREEN ? 'green' : key === RED ? 'red' : key === PURPLE ? 'purple' : 'neutral';
}

/* Comma-separated edge-midpoints for connector dots (all four edges of each card) */
const DOTS: Record<string, [number, number][]> = Object.fromEntries(
  NODES.map((n) => [
    n.id,
    [
      [n.x, n.y + NODE_H / 2],
      [n.x + NODE_W, n.y + NODE_H / 2],
      [n.x + NODE_W / 2, n.y],
      [n.x + NODE_W / 2, n.y + NODE_H],
    ],
  ])
) as Record<string, [number, number][]>;

export default function ArchitectureCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Scale the fixed-size artboard down to fit its container - never scrolls.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const resize = () => setScale(Math.min(1, el.clientWidth / CANVAS_W));
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height: CANVAS_H * scale }}>
      <div
        className="relative mx-auto"
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: 'top center' }}
      >
        {/* Node cards (HTML) */}
        {NODES.map((node) => {
          const tint = TINTS[node.tone];
          return (
            <div
              key={node.id}
              className="absolute flex flex-col items-center"
              style={{ left: node.x, top: node.y }}
            >
              <div
                className="relative flex items-center justify-center w-[132px] h-[68px] rounded-[20px] border border-[var(--border-default)] bg-white"
                style={{ boxShadow: `0 1px 2px rgba(31,27,22,0.06), 0 0 24px ${tint.glow}` }}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tint.chip}`}>
                  <node.icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                {/* operational badge - uniform success on every node */}
                <span className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-success flex items-center justify-center shadow-[0_0_10px_rgba(22,163,74,0.35)]">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
              </div>
              <span className="mt-2 text-xs font-medium text-text-secondary whitespace-nowrap">
                {node.label}
              </span>
            </div>
          );
        })}

        {/* Connectors (SVG on top) */}
        <svg
          className="absolute inset-0 w-[1380px] h-[620px] pointer-events-none"
          viewBox="0 0 1380 620"
          fill="none"
        >
          <defs>
            {(['neutral', 'green', 'red', 'purple'] as const).map((c) => (
              <marker
                key={c}
                id={`arr-${c}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 1 L 9 5 L 0 9 Z"
                  fill={c === 'green' ? GREEN : c === 'red' ? RED : c === 'purple' ? PURPLE : '#8a8378'}
                />
              </marker>
            ))}
          </defs>

          {PATHS.map((p) => (
            <path
              key={p.id}
              d={p.d}
              stroke={p.color}
              strokeWidth={p.id === 'p9' ? 2.25 : 1.75}
              strokeLinecap="round"
              strokeDasharray="7 7"
              markerEnd={`url(#${ARROW_IDS[p.color]})`}
              className="flow-dash"
            />
          ))}

          {/* Connector dots on all four edges of every node */}
          {Object.values(DOTS)
            .flat()
            .map(([cx, cy], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={3.25}
                fill="#ffffff"
                stroke="rgba(31,27,22,0.18)"
                strokeWidth={1.25}
              />
            ))}

          {/* Line labels (Yes / No / streak / streak++) */}
          {PATHS.filter((p) => p.label).map((p) => (
            <g key={`label-${p.id}`}>
              <rect
                x={p.label!.x - 24}
                y={p.label!.y - 9}
                width={p.label!.text.length > 6 ? 62 : 48}
                height={18}
                rx={9}
                fill="#ffffff"
                stroke={p.color}
                strokeOpacity={0.35}
              />
              <text
                x={p.label!.x}
                y={p.label!.y + 3}
                textAnchor="middle"
                fill={p.color}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 600 }}
              >
                {p.label!.text}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <style>{`
        .flow-dash {
          stroke-dashoffset: 0;
        }
        @media (prefers-reduced-motion: no-preference) {
          .flow-dash {
            animation: flowdash 1.4s linear infinite;
            stroke-dashoffset: 0;
          }
        }
        @keyframes flowdash {
          to { stroke-dashoffset: -28; }
        }
      `}</style>
    </div>
  );
}
