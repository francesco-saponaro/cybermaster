import type { AttackId, FixId } from '../../content/arcade/defence';

// Small line drawings, one per attack and one per kind of fix, so a unit can be
// told apart by shape as well as by its label.

export function AttackGlyph({ type, size = 18 }: { type: AttackId; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {type === 'sqli' ? (
        <g {...common}>
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
        </g>
      ) : type === 'xss' ? (
        <g {...common}>
          <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
          <path d="M14 4l-4 16" />
        </g>
      ) : type === 'idor' ? (
        <g {...common}>
          <circle cx="8" cy="12" r="4" />
          <path d="M12 12h10M18 12v4M21 12v3" />
        </g>
      ) : type === 'cmdi' ? (
        <g {...common}>
          <path d="M4 7l6 5-6 5" />
          <path d="M12 18h8" />
        </g>
      ) : type === 'ssrf' ? (
        <g {...common}>
          <path d="M20 12a8 8 0 1 1-3-6.2" />
          <path d="M18 2v5h-5" />
        </g>
      ) : (
        <g {...common}>
          <path d="M4 6h16M4 12h12M4 18h8" />
        </g>
      )}
    </svg>
  );
}

export function FixGlyph({ fix, size = 18 }: { fix: FixId; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {fix === 'waf' ? (
        <g {...common}>
          <rect x="3" y="5" width="18" height="14" rx="1" />
          <path d="M3 12h18M9 5v7M15 12v7" />
        </g>
      ) : (
        <g {...common}>
          <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
          <path d="M8.5 12l2.5 2.5 4.5-5" />
        </g>
      )}
    </svg>
  );
}
