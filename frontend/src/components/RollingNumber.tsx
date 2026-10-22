'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that rolls to its new value instead of snapping.
 *
 * Balances change because a bet filled or a claim landed, and a value that
 * jumps silently reads as a glitch. Easing it over ~600ms makes the change
 * legible as an event.
 *
 * Respects `prefers-reduced-motion`: the roll is decoration, the number is not.
 */
export function RollingNumber({
  value,
  decimals = 2,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from.current === value) {
      from.current = value;
      setShown(value);
      return;
    }

    const start = performance.now();
    const origin = from.current;
    const delta = value - origin;
    const DURATION = 600;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setShown(origin + delta * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = value;
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      from.current = value;
    };
  }, [value]);

  return <span className={className}>{shown.toFixed(decimals)}</span>;
}
