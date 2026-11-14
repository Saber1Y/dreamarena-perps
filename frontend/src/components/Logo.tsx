import { useId } from 'react';

/**
 * The DreamArena mark: a chain block with a Reactivity bolt striking through
 * it, because every score lands in the same block as the trade.
 */
export function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  const fill = useId();
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9a5cff" />
          <stop offset="1" stopColor="#5b1fc4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${fill})`} />
      <rect x="8.5" y="8.5" width="15" height="15" rx="3.5" stroke="white" strokeOpacity="0.45" strokeWidth="2.2" />
      <path d="M17.6 5.5 10.6 17.4h5.2l-1.6 9.1 7.2-12.1h-5.3z" fill="white" />
    </svg>
  );
}

export function LogoText({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Logo />
      <span className="font-bold text-lg tracking-tight">DreamArena</span>
    </div>
  );
}
