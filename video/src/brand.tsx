import type { CSSProperties, ReactNode } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

/** The app's tokens (frontend/src/app/globals.css), so the film and the product look like one thing. */
export const C = {
  paper: "#faf8f4",
  surface: "#ffffff",
  elevated: "#f4f1eb",
  ink: "#1f1b16",
  secondary: "#6d675d",
  muted: "#8f887c",
  purple: "#8e47ff",
  purpleDeep: "#6a24d9",
  purpleSoft: "rgba(142, 71, 255, 0.09)",
  success: "#15803d",
  successSoft: "rgba(21, 128, 61, 0.09)",
  danger: "#c2410c",
  dangerSoft: "rgba(194, 65, 12, 0.09)",
  border: "rgba(31, 27, 22, 0.08)",
  borderStrong: "rgba(31, 27, 22, 0.14)",
} as const;

export const sans = loadSora("normal", { weights: ["400", "600", "700"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;

/** Sizes in units of the short side, so 16:9, 1:1 and 9:16 share one layout. */
export function useLayout() {
  const { width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  return { width, height, u, wide: width / height > 1.3, tall: height / width > 1.3 };
}

/** Spring entrance from 92% scale and transparent; settles fast with a hint of overshoot. */
export function usePop(delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - delay, fps, config: { damping: 13, stiffness: 170, mass: 0.7, ...config } });
  return {
    p,
    style: { opacity: interpolate(p, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }), transform: `scale(${0.92 + 0.08 * p})` } as CSSProperties,
  };
}

/** 0..1 over a frame range with a strong ease-out, matching the app's UI motion. */
export function useProgress(start: number, end: number) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return 1 - Math.pow(1 - t, 3);
}

/** The app's card: white surface, hairline border, purple-tinted shadow. */
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { u } = useLayout();
  return (
    <div
      style={{
        background: C.surface,
        border: `${2 * u}px solid ${C.border}`,
        borderRadius: 28 * u,
        boxShadow: `0 ${2 * u}px 0 rgba(31,27,22,0.03), 0 ${28 * u}px ${60 * u}px -${26 * u}px rgba(74,32,140,0.35)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The small uppercase label the app puts above data. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { u } = useLayout();
  return (
    <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 22 * u, letterSpacing: 2.4 * u, textTransform: "uppercase", color: C.muted, ...style }}>
      {children}
    </div>
  );
}

/** The DreamArena mark, drawn from the app's favicon. */
export function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill={C.purple} />
      <path d="M16 8L20 14H12L16 8Z" fill="white" fillOpacity="0.9" />
      <path d="M16 24L12 18H20L16 24Z" fill="white" fillOpacity="0.6" />
      <circle cx="16" cy="16" r="3" fill="white" />
    </svg>
  );
}

/** Cream paper with one slow purple glow, like the app's background. */
export function Backdrop() {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 80) * 5;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `radial-gradient(circle at ${18 + drift}% -8%, rgba(142,71,255,0.16), transparent 42%), radial-gradient(circle at ${104 - drift}% 108%, rgba(142,71,255,0.10), transparent 40%), ${C.paper}`,
      }}
    />
  );
}
