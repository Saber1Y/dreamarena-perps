'use client';

/**
 * Deterministic identicon avatar for an on-chain player.
 *
 * The address is the seed: the same address always renders the same avatar,
 * from the first visit to the leaderboard seat. No uploads, no storage, no
 * external request - just an inline SVG derived from the wallet's last bytes.
 */
export function Avatar({ address, size = 48, className }: { address?: string; size?: number; className?: string }) {
  if (!address) {
    return (
      <div
        className={`bg-elevated rounded-2xl flex items-center justify-center text-text-muted ${className ?? ''}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        ?
      </div>
    );
  }

  const norm = address.toLowerCase();
  const seed = BigInt(`0x${norm.slice(-12)}`);
  const hue = Number(seed % 360n);
  const step = Number(seed / 360n) % 6;

  // Muted palette tuned to the cream design system - a single avatar's colours
  // come from one base hue plus a fixed complementary offset.
  const palettes = [
    [hue, (hue + 140) % 360, (hue + 280) % 360],
    [hue, (hue + 200) % 360, (hue + 80) % 360],
    [hue, (hue + 100) % 360, (hue + 250) % 360],
  ];
  const [a, b, c] = palettes[step % palettes.length];
  const colors = [
    `hsl(${a} 42% 48%)`,
    `hsl(${b} 38% 40%)`,
    `hsl(${c} 35% 55%)`,
    `hsl(${a} 30% 72%)`,
  ];

  // 8x8 grid, right half mirrors the left - the blocky identicon classic.
  const cols = 8;
  const cell = size / cols;
  const cells: { x: number; y: number; color: string }[] = [];
  const cellsPerSide = Math.floor(cols / 2) + (cols % 2);
  for (let y = 0; y < cols; y++) {
    for (let x = 0; x < cellsPerSide; x++) {
      const bit = (seed >> BigInt(y * cellsPerSide + x)) & 1n;
      if (bit === 1n) continue;
      const color = colors[Number((seed >> BigInt(y * cellsPerSide + x + 40)) % 4n)];
      cells.push({ x: x * cell, y: y * cell, color });
      const mirrorX = cols - 1 - x;
      if (mirrorX !== x) cells.push({ x: mirrorX * cell, y: y * cell, color });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={`Avatar for ${norm.slice(0, 6)}...${norm.slice(-4)}`}
    >
      <rect width={size} height={size} fill={`hsl(${hue} 25% 88%)`} rx={size * 0.22} />
      {cells.map((cellRect, i) => (
        <rect key={i} x={cellRect.x} y={cellRect.y} width={cell} height={cell} fill={cellRect.color} />
      ))}
    </svg>
  );
}