// The scope ring: the game's one motif. A reticle drawn as inline SVG so it
// scales from the 28px logo to a 320px zone node without a new asset.

export function Scope({
  size = 40,
  filled = false,
  progress,
  locked = false,
  cleared = false,
  className,
  spin = false,
}: {
  size?: number;
  filled?: boolean;
  progress?: number; // 0..1, draws an arc
  locked?: boolean;
  cleared?: boolean;
  className?: string;
  spin?: boolean;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const ring = cleared ? 'var(--accent)' : locked ? 'var(--muted-2)' : 'var(--ink)';
  const inner = filled || cleared ? 'var(--accent)' : 'transparent';
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {/* outer ring */}
      <circle cx="50" cy="50" r={r} fill="none" stroke={ring} strokeWidth="4" opacity={locked ? 0.5 : 1} />
      {/* reticle ticks */}
      <g className={spin ? 'spin-slow' : undefined} style={{ transformOrigin: 'center' }}>
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1="50"
            y1="4"
            x2="50"
            y2="16"
            stroke={ring}
            strokeWidth="4"
            opacity={locked ? 0.5 : 1}
            transform={`rotate(${a} 50 50)`}
          />
        ))}
      </g>
      {/* middle ring */}
      <circle cx="50" cy="50" r="30" fill="none" stroke={ring} strokeWidth="3" opacity={locked ? 0.4 : 0.8} />
      {/* centre dot */}
      <circle cx="50" cy="50" r="12" fill={inner} stroke={ring} strokeWidth="3" opacity={locked ? 0.5 : 1} />
      {typeof progress === 'number' && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.2,0.7,0.2,1)' }}
        />
      )}
    </svg>
  );
}
