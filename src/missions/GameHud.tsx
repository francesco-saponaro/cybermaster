// The in-mission HUD: score, combo and lives. Shared by the fast missions.

export function GameHud({
  score,
  combo,
  lives,
  right,
}: {
  score?: number;
  combo?: number;
  lives?: { current: number; max: number };
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        marginBottom: 16,
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
      }}
    >
      {typeof score === 'number' && (
        <span className="tnum" style={{ fontSize: '1.3rem' }}>
          {score.toLocaleString()}
          <span style={{ color: 'var(--muted)', fontSize: '0.7rem', fontWeight: 600 }}> PTS</span>
        </span>
      )}
      {typeof combo === 'number' && combo > 1 && (
        <span className="tag" data-tone="accent" style={{ fontSize: '0.85rem' }}>
          {combo}x combo
        </span>
      )}
      {lives && (
        <span style={{ display: 'inline-flex', gap: 4 }} aria-label={`${lives.current} of ${lives.max} lives`}>
          {Array.from({ length: lives.max }).map((_, i) => (
            <svg key={i} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 21s-7-4.5-9.5-9C.8 9 2 5.5 5.2 5.5c2 0 3.2 1.3 3.8 2.3.6-1 1.8-2.3 3.8-2.3C16 5.5 17.2 9 15.5 12 13 16.5 12 21 12 21z"
                transform="translate(0 -1)"
                fill={i < lives.current ? 'var(--accent)' : 'none'}
                stroke={i < lives.current ? 'var(--accent)' : 'var(--muted-2)'}
                strokeWidth="1.5"
              />
            </svg>
          ))}
        </span>
      )}
      <span style={{ marginLeft: 'auto' }}>{right}</span>
    </div>
  );
}
