export function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#8e47ff" />
      <path
        d="M16 8L20 14H12L16 8Z"
        fill="white"
        fillOpacity="0.9"
      />
      <path
        d="M16 24L12 18H20L16 24Z"
        fill="white"
        fillOpacity="0.6"
      />
      <circle cx="16" cy="16" r="3" fill="white" />
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
