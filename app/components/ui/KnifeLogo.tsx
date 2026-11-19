import { useId } from "react";

interface KnifeLogoProps {
  className?: string;
}

/**
 * Vector brand logo based on the kitchen knife (U+1F52A) icon.
 */
export function KnifeLogo({ className = "w-5 h-5" }: KnifeLogoProps) {
  const uid = useId();
  const bladeId = `knife-blade-${uid}`;
  const handleId = `knife-handle-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="knife"
    >
      <defs>
        <linearGradient id={bladeId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="65%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
        <linearGradient id={handleId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1E293B" />
        </linearGradient>
      </defs>
      <g transform="rotate(-45 256 256)">
        <path
          d="M 38 228 L 306 218 L 306 296 Q 282 300 264 298 Q 144 298 38 228 Z"
          fill={`url(#${bladeId})`}
        />
        <path d="M 44 229 Q 146 290 264 290 L 264 298 Q 144 298 38 228 Z" fill="#F8FAFC" />
        <rect x="298" y="216" width="24" height="46" rx="4" fill="#64748B" />
        <path
          d="M 320 220 L 452 215 Q 474 215 474 238 Q 474 263 452 261 L 320 256 Z"
          fill={`url(#${handleId})`}
          stroke="#64748B"
          strokeWidth="3"
        />
        <circle cx="362" cy="238" r="7" fill="#CBD5E1" />
        <circle cx="422" cy="238" r="7" fill="#CBD5E1" />
      </g>
    </svg>
  );
}
