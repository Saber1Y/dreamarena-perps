import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Backdrop, C, Card, Eyebrow, Mark, mono, sans, useLayout, usePop, useProgress } from "./brand";
import manifest from "../public/voiceover/manifest.json";

/**
 * DreamArena Perps announcement at 30 fps. Scene lengths come from the voiceover
 * (public/voiceover/manifest.json): each line starts LEAD frames into its scene and the next
 * scene follows TAIL frames after it ends, with a minimum so each scene's animation fits.
 */
export const FPS = 30;
const LEAD = 8;
const TAIL = 6;
/** How long the end card holds after the last line. */
const HOLD = 36;

const ORDER = [
  { name: "trust", vo: "vo-01", min: 96 },
  { name: "chain", vo: "vo-02", min: 78 },
  { name: "trade", vo: "vo-03", min: 72 },
  { name: "games", vo: "vo-04", min: 96 },
  { name: "block", vo: "vo-05", min: 150 },
  { name: "noKeeper", vo: "vo-06", min: 96 },
  { name: "agent", vo: "vo-07", min: 150 },
  { name: "logo", vo: "vo-08", min: 0 },
] as const;

type SceneName = (typeof ORDER)[number]["name"];
type Timing = { from: number; to: number; vo: { id: string; at: number } };

function timeline(): { scenes: Record<SceneName, Timing>; duration: number } {
  const scenes = {} as Record<SceneName, Timing>;
  let t = 0;
  for (const s of ORDER) {
    const line = (manifest as Record<string, { seconds: number }>)[s.vo];
    if (!line) throw new Error(`voiceover line ${s.vo} is missing; run npm run voiceover`);
    const vo = Math.ceil(line.seconds * FPS);
    const length = Math.max(s.min, LEAD + vo + (s.name === "logo" ? HOLD : TAIL));
    scenes[s.name] = { from: t, to: t + length, vo: { id: s.vo, at: t + LEAD } };
    t += length;
  }
  return { scenes, duration: t };
}

const { scenes: SCENES, duration } = timeline();
export const DURATION = duration;

/** Real values from the arena at 0xc96B089140EfA3447fC238AaE0Af30753C0c47b6. */
const REAL = {
  arena: "0xc96B…47b6",
  block: "31,075,535",
  trade: "0xc3b71e…d089a",
  callback: "0xf57707…e6177e",
  pnl: "+0.0030",
  url: "dreamarena-perps.vercel.app",
};

/** Centers a scene; in 16:9 the content scales up a little to use the wider frame. */
function Center({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const { wide } = useLayout();
  return <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: wide ? "scale(1.15)" : undefined, ...style }}>{children}</AbsoluteFill>;
}

// ---------------------------------------------------------------------------
// 1. "Most trading games ask you to trust their scoreboard."
// ---------------------------------------------------------------------------
function SceneTrust() {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const board = usePop(2);
  const stamp = usePop(46, { damping: 9, stiffness: 220 });
  const rows = [
    ["0x8a…21", 12],
    ["0x3f…e9", 9],
    ["0xb1…74", 7],
    ["0x55…0c", 4],
  ] as const;
  return (
    <Center>
      <div style={{ ...board.style, position: "relative" }}>
        <Card style={{ width: 640 * u, padding: `${34 * u}px ${40 * u}px` }}>
          <Eyebrow>Leaderboard · best streak</Eyebrow>
          {rows.map(([who, base], i) => {
            // The numbers keep rewriting themselves: a score nobody can check.
            const jitter = Math.floor(Math.abs(Math.sin((frame + i * 17) / 5)) * 6);
            return (
              <div key={who} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${18 * u}px 0`, borderTop: i ? `${2 * u}px solid ${C.border}` : "none" }}>
                <span style={{ fontFamily: mono, fontSize: 32 * u, color: C.secondary }}>
                  {i + 1}. {who}
                </span>
                <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 40 * u, color: C.ink }}>{base + jitter}</span>
              </div>
            );
          })}
        </Card>
        <div
          style={{
            position: "absolute",
            right: -120 * u,
            top: -96 * u,
            opacity: stamp.style.opacity,
            transform: `rotate(-12deg) scale(${1.25 - 0.25 * stamp.p})`,
            border: `${6 * u}px solid ${C.danger}`,
            borderRadius: 14 * u,
            padding: `${10 * u}px ${24 * u}px`,
            fontFamily: sans,
            fontWeight: 700,
            fontSize: 44 * u,
            color: C.danger,
            background: "rgba(250,248,244,0.92)",
            whiteSpace: "nowrap",
          }}
        >
          TRUST US?
        </div>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 2. "Dream Arena hands the scoreboard to the chain."
// ---------------------------------------------------------------------------
function SceneChain() {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const brand = usePop(4);
  const chip = usePop(26);
  const blocks = useProgress(10, 50);
  return (
    <Center style={{ flexDirection: "column", gap: 44 * u }}>
      <div style={{ display: "flex", gap: 22 * u, opacity: blocks }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 96 * u,
              height: 96 * u,
              borderRadius: 20 * u,
              background: i === 2 ? C.purple : C.surface,
              border: `${3 * u}px solid ${i === 2 ? C.purple : C.borderStrong}`,
              transform: `translateY(${(1 - blocks) * (i % 2 ? 30 : -30) * u + Math.sin((frame + i * 9) / 14) * 4 * u}px)`,
              boxShadow: i === 2 ? `0 ${18 * u}px ${40 * u}px -${12 * u}px rgba(142,71,255,0.6)` : "none",
            }}
          />
        ))}
      </div>
      <div style={{ ...brand.style, display: "flex", alignItems: "center", gap: 26 * u }}>
        <Mark size={110 * u} />
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 104 * u, letterSpacing: -3 * u, color: C.ink, whiteSpace: "nowrap" }}>DreamArena</span>
      </div>
      <div
        style={{
          ...chip.style,
          fontFamily: mono,
          fontSize: 32 * u,
          color: C.purpleDeep,
          background: C.purpleSoft,
          borderRadius: 999,
          padding: `${12 * u}px ${30 * u}px`,
          whiteSpace: "nowrap",
        }}
      >
        PerpsArena {REAL.arena} · on Somnia
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 3. "Trade real perps on Dream Dex."
// ---------------------------------------------------------------------------
function SceneTrade() {
  const { u } = useLayout();
  const card = usePop(2);
  const filled = useProgress(38, 50);
  return (
    <Center style={{ flexDirection: "column", gap: 40 * u }}>
      <div style={card.style}>
        <Card style={{ width: 600 * u, padding: 38 * u }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40 * u, color: C.ink }}>Trade</span>
            <span style={{ fontFamily: mono, fontSize: 26 * u, color: C.muted }}>dreamDEX perps</span>
          </div>
          <div style={{ display: "flex", gap: 14 * u, marginTop: 26 * u }}>
            {["BTC", "ETH", "SOL"].map((m) => (
              <span key={m} style={{ fontFamily: sans, fontWeight: 700, fontSize: 28 * u, padding: `${10 * u}px ${22 * u}px`, borderRadius: 14 * u, background: m === "ETH" ? C.ink : C.elevated, color: m === "ETH" ? C.paper : C.secondary }}>
                {m}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 26 * u, background: C.elevated, borderRadius: 18 * u, padding: `${18 * u}px ${24 * u}px`, display: "flex", justifyContent: "space-between" }}>
            <div>
              <Eyebrow>Mark</Eyebrow>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 38 * u, color: C.ink }}>2,398.28</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Eyebrow>Size</Eyebrow>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 38 * u, color: C.ink }}>25 USDso</div>
            </div>
          </div>
          <div
            style={{
              marginTop: 26 * u,
              borderRadius: 18 * u,
              padding: `${20 * u}px 0`,
              textAlign: "center",
              fontFamily: sans,
              fontWeight: 700,
              fontSize: 34 * u,
              color: "white",
              background: filled > 0.5 ? C.success : C.purple,
              boxShadow: `0 ${14 * u}px ${30 * u}px -${12 * u}px ${filled > 0.5 ? "rgba(21,128,61,0.6)" : "rgba(142,71,255,0.7)"}`,
            }}
          >
            {filled > 0.5 ? "Filled · long 0.0104 ETH" : "Long ETH"}
          </div>
        </Card>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 4. "Then pick a fight: Survivor, Streak, or Boss."
// ---------------------------------------------------------------------------
function GameCard({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  const { u } = useLayout();
  const pop = usePop(delay, { damping: 12 });
  return (
    <div style={{ ...pop.style, transform: `${pop.style.transform} translateY(${(1 - pop.p) * 40 * u}px)` }}>
      <Card style={{ width: 300 * u, height: 300 * u, padding: 30 * u, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40 * u, color: C.ink }}>{title}</span>
        {children}
      </Card>
    </div>
  );
}

function SceneGames() {
  const frame = useCurrentFrame();
  const { u, tall } = useLayout();
  const secondsLeft = Math.max(0, 299 - Math.floor(frame / 3));
  const streak = Math.min(3, Math.floor(Math.max(0, frame - 44) / 14));
  const hp = Math.max(0, 3 - Math.floor(Math.max(0, frame - 66) / 9));
  return (
    <Center>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 34 * u }}>
        <GameCard title="Survivor" delay={4}>
          <div>
            <Eyebrow>Survive for</Eyebrow>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 64 * u, color: C.ink }}>
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </div>
          </div>
        </GameCard>
        <GameCard title="Streak" delay={26}>
          <div>
            <Eyebrow>Wins in a row</Eyebrow>
            <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 80 * u, color: C.purple, lineHeight: 1 }}>{streak}</div>
          </div>
        </GameCard>
        <GameCard title="Boss" delay={48}>
          <div>
            <Eyebrow>Boss health</Eyebrow>
            <div style={{ display: "flex", gap: 10 * u, marginTop: 12 * u }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ flex: 1, height: 22 * u, borderRadius: 99, background: C.danger, opacity: i < hp ? 1 : 0.16 }} />
              ))}
            </div>
          </div>
        </GameCard>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 5. "The moment your position moves, Somnia Reactivity calls our contract, in the same block."
// ---------------------------------------------------------------------------
function TxRow({ label, hash, delay, accent }: { label: string; hash: string; delay: number; accent: string }) {
  const { u } = useLayout();
  const slide = useProgress(delay, delay + 16);
  return (
    <div
      style={{
        opacity: slide,
        transform: `translateX(${(1 - slide) * -80 * u}px)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 30 * u,
        padding: `${20 * u}px ${26 * u}px`,
        borderRadius: 18 * u,
        background: C.elevated,
        borderLeft: `${8 * u}px solid ${accent}`,
      }}
    >
      <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 32 * u, color: C.ink, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 28 * u, color: C.secondary, whiteSpace: "nowrap" }}>{hash}</span>
    </div>
  );
}

function SceneBlock() {
  const { u } = useLayout();
  const card = usePop(2);
  const badge = usePop(78, { damping: 10 });
  const score = usePop(104);
  return (
    <Center>
      <div style={card.style}>
        <Card style={{ width: 940 * u, padding: 40 * u }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Eyebrow>Somnia block</Eyebrow>
            <span style={{ fontFamily: mono, fontWeight: 700, fontSize: 44 * u, color: C.ink }}>{REAL.block}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 * u, marginTop: 28 * u }}>
            <TxRow label="Your trade" hash={REAL.trade} delay={20} accent={C.ink} />
            <TxRow label="Arena callback" hash={REAL.callback} delay={46} accent={C.purple} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30 * u, minHeight: 64 * u }}>
            <span
              style={{
                ...badge.style,
                fontFamily: sans,
                fontWeight: 700,
                fontSize: 28 * u,
                color: C.success,
                background: C.successSoft,
                borderRadius: 12 * u,
                padding: `${10 * u}px ${20 * u}px`,
                whiteSpace: "nowrap",
              }}
            >
              ✓ same block as the trade
            </span>
            <span style={{ ...score.style, fontFamily: mono, fontWeight: 700, fontSize: 32 * u, color: C.success, whiteSpace: "nowrap" }}>
              scored {REAL.pnl} · win 1
            </span>
          </div>
        </Card>
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 6. "No keeper. No backend. No score anyone can fake."
// ---------------------------------------------------------------------------
function Struck({ text, delay }: { text: string; delay: number }) {
  const { u } = useLayout();
  const pop = usePop(delay);
  const strike = useProgress(delay + 10, delay + 22);
  return (
    <div style={{ ...pop.style, position: "relative" }}>
      <Card style={{ padding: `${24 * u}px ${40 * u}px`, borderRadius: 999 }}>
        <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 48 * u, color: C.secondary, whiteSpace: "nowrap" }}>{text}</span>
      </Card>
      <div
        style={{
          position: "absolute",
          left: 24 * u,
          top: "50%",
          height: 8 * u,
          width: `calc(${strike * 100}% - ${48 * u * strike}px)`,
          background: C.danger,
          borderRadius: 99,
          transform: "rotate(-4deg)",
        }}
      />
    </div>
  );
}

function SceneNoKeeper() {
  const { u, tall } = useLayout();
  return (
    <Center>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", gap: 30 * u, alignItems: "center", flexWrap: "wrap", justifyContent: "center", maxWidth: tall ? undefined : 1700 * u }}>
        <Struck text="Keeper" delay={6} />
        <Struck text="Backend" delay={26} />
        <Struck text="Fake scores" delay={48} />
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 7. "Or let an AI agent trade for you, inside hard limits. It can never withdraw."
// ---------------------------------------------------------------------------
const TERMINAL = [
  { at: 4, text: "> open_position ETH long 25", color: "#f4f1eb" },
  { at: 26, text: "  filled   0.0104 ETH", color: "#86efac" },
  { at: 50, text: "> open_position DOGE long 25", color: "#f4f1eb" },
  { at: 72, text: "  refused  not in allowed markets", color: "#fdba74" },
];

function SceneAgent() {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const term = usePop(0);
  const lock = usePop(100, { damping: 10 });
  return (
    <Center style={{ flexDirection: "column", gap: 40 * u }}>
      <div style={term.style}>
        <div style={{ width: 780 * u, borderRadius: 26 * u, background: C.ink, padding: `${30 * u}px ${36 * u}px`, boxShadow: `0 ${30 * u}px ${70 * u}px -${26 * u}px rgba(74,32,140,0.6)` }}>
          <div style={{ display: "flex", gap: 10 * u, marginBottom: 22 * u }}>
            {["#c2410c", "#b45309", "#15803d"].map((c) => (
              <span key={c} style={{ width: 16 * u, height: 16 * u, borderRadius: 99, background: c, opacity: 0.9 }} />
            ))}
            <span style={{ marginLeft: 14 * u, fontFamily: mono, fontSize: 22 * u, color: C.muted }}>dreamarena perps agent · MCP</span>
          </div>
          {TERMINAL.map((l) => {
            // Typed out, one character every frame.
            const shown = Math.max(0, Math.min(l.text.length, (frame - l.at) * 1.6));
            return (
              <div key={l.at} style={{ fontFamily: mono, fontSize: 32 * u, lineHeight: 1.6, color: l.color, whiteSpace: "pre", minHeight: 32 * u * 1.6 }}>
                {l.text.slice(0, Math.floor(shown))}
              </div>
            );
          })}
        </div>
      </div>
      <div
        style={{
          ...lock.style,
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 36 * u,
          color: C.purpleDeep,
          background: C.purpleSoft,
          borderRadius: 999,
          padding: `${14 * u}px ${34 * u}px`,
          whiteSpace: "nowrap",
        }}
      >
        🔒 can never withdraw
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------
// 8. "Dream Arena. Leverage challenges, refereed by the chain."
// ---------------------------------------------------------------------------
function SceneLogo() {
  const { u, wide } = useLayout();
  // 1:1 and 9:16 are 1080 wide: the wordmark shrinks and the tagline breaks at its comma.
  const wordSize = (wide ? 116 : 96) * u;
  const mark = usePop(0, { damping: 10 });
  const word = usePop(8);
  const line = usePop(30);
  const url = usePop(52);
  const tag = usePop(64);
  return (
    <Center style={{ flexDirection: "column", gap: 34 * u, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 * u }}>
        <div style={mark.style}>
          <Mark size={wordSize * 1.1} />
        </div>
        <div style={{ ...word.style, display: "flex", alignItems: "center", gap: 22 * u }}>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: wordSize, letterSpacing: -3.5 * u, color: C.ink, whiteSpace: "nowrap" }}>DreamArena</span>
          <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 40 * u, color: C.purpleDeep, background: C.purpleSoft, borderRadius: 12 * u, padding: `${6 * u}px ${18 * u}px` }}>Perps</span>
        </div>
      </div>
      <div style={{ ...line.style, fontFamily: sans, fontWeight: 600, fontSize: 56 * u, letterSpacing: -1 * u, lineHeight: 1.2, color: C.ink, whiteSpace: "nowrap" }}>
        Leverage challenges,{wide ? " " : <br />}
        <span style={{ color: C.purple }}>refereed by the chain.</span>
      </div>
      <div
        style={{
          ...url.style,
          marginTop: 10 * u,
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 34 * u,
          color: "white",
          background: C.purple,
          borderRadius: 999,
          padding: `${14 * u}px ${36 * u}px`,
          boxShadow: `0 ${16 * u}px ${36 * u}px -${14 * u}px rgba(142,71,255,0.75)`,
          whiteSpace: "nowrap",
        }}
      >
        {REAL.url}
      </div>
      <div style={{ ...tag.style, fontFamily: sans, fontWeight: 600, fontSize: 30 * u, color: C.secondary, whiteSpace: "nowrap" }}>
        On dreamDEX perps · Somnia testnet
      </div>
    </Center>
  );
}

// ---------------------------------------------------------------------------

/** A scene with a short fade at each end, so cuts never jump. */
function Scene({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  return (
    <Sequence from={from} durationInFrames={to - from} layout="none">
      <FadeEdges length={to - from}>{children}</FadeEdges>
    </Sequence>
  );
}

function FadeEdges({ length, children }: { length: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 6, length - 6, length], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // A small drift so no scene sits perfectly still.
  const drift = interpolate(frame, [0, length], [0, -10], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity, transform: `translateY(${drift}px)` }}>{children}</AbsoluteFill>;
}

export function Announcement({ withVoiceover = true }: { withVoiceover?: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden" }}>
      <Backdrop />
      <Scene {...SCENES.trust}>
        <SceneTrust />
      </Scene>
      <Scene {...SCENES.chain}>
        <SceneChain />
      </Scene>
      <Scene {...SCENES.trade}>
        <SceneTrade />
      </Scene>
      <Scene {...SCENES.games}>
        <SceneGames />
      </Scene>
      <Scene {...SCENES.block}>
        <SceneBlock />
      </Scene>
      <Scene {...SCENES.noKeeper}>
        <SceneNoKeeper />
      </Scene>
      <Scene {...SCENES.agent}>
        <SceneAgent />
      </Scene>
      <Scene {...SCENES.logo}>
        <SceneLogo />
      </Scene>
      {withVoiceover &&
        Object.values(SCENES).map(({ vo }) => (
          <Sequence key={vo.id} from={vo.at} layout="none">
            <Audio src={staticFile(`voiceover/${vo.id}.wav`)} />
          </Sequence>
        ))}
    </AbsoluteFill>
  );
}

