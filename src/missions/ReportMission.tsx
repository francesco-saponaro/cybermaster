import { useState } from 'react';
import type { ReportMission } from '../content/types';
import { trustScore, clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

// The Report: build a finding field by field from fragments. Each choice moves
// the client's trust meter. The final finding is shown assembled.
export function ReportMissionView({ mission, onFinish }: { mission: ReportMission; onFinish: (score: number) => void }) {
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);

  const trust = (() => {
    const qualities = mission.fields
      .map((f, i) => (picks[i] !== undefined ? f.options[picks[i]!]!.quality : null))
      .filter((q): q is 'good' | 'weak' | 'wrong' => q !== null);
    return trustScore(qualities);
  })();

  const allPicked = mission.fields.every((_, i) => picks[i] !== undefined);

  function pick(fieldIndex: number, optionIndex: number) {
    if (done) return;
    setPicks((p) => ({ ...p, [fieldIndex]: optionIndex }));
    const q = mission.fields[fieldIndex]!.options[optionIndex]!.quality;
    play(q === 'good' ? 'hit' : q === 'wrong' ? 'miss' : 'blip');
  }

  function submit() {
    setDone(true);
    const qualities = mission.fields.map((f, i) => f.options[picks[i]!]!.quality);
    onFinish(clampScore(trustScore(qualities)));
  }

  return (
    <div>
      <div className="panel" style={{ padding: '14px 16px', marginBottom: 16 }}>
        {mission.scenario.map((line, i) => (
          <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}>
            {line}
          </p>
        ))}
      </div>

      <div style={{ position: 'sticky', top: 72, zIndex: 10, background: 'var(--bg)', paddingBlock: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, whiteSpace: 'nowrap' }}>Client trust</span>
          <div className="meter" style={{ flex: 1 }} role="progressbar" aria-valuenow={Math.round(trust)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${trust}%` }} />
          </div>
          <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, width: 44, textAlign: 'right' }}>
            {Math.round(trust)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {mission.fields.map((field, fi) => (
          <div key={fi}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>
              <span className="tnum" style={{ color: 'var(--accent-text)', marginRight: 8 }}>{fi + 1}.</span>
              {field.name}
            </h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {field.options.map((opt, oi) => {
                const selected = picks[fi] === oi;
                return (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => pick(fi, oi)}
                    disabled={done}
                    className="panel"
                    aria-pressed={selected}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderColor: done && selected ? qualityColour(opt.quality) : selected ? 'var(--accent)' : 'var(--line)',
                      background: selected ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
                      cursor: done ? 'default' : 'pointer',
                      color: 'var(--ink)',
                    }}
                  >
                    {opt.text}
                    {(done || selected) && selected && (
                      <span style={{ display: 'block', marginTop: 6, fontSize: '0.85rem', color: qualityColour(opt.quality), fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                        {opt.note}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!done ? (
        <button type="button" className="btn btn-primary" onClick={submit} disabled={!allPicked} style={{ marginTop: 20 }}>
          File the finding
        </button>
      ) : (
        <div className="panel pop" style={{ marginTop: 20, padding: 'clamp(16px,3vw,24px)' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Your finding, as filed</h2>
          <dl style={{ margin: 0 }}>
            {mission.fields.map((field, fi) => {
              const opt = field.options[picks[fi]!]!;
              return (
                <div key={fi} style={{ marginBottom: 12 }}>
                  <dt style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--muted)' }}>{field.name}</dt>
                  <dd style={{ margin: '2px 0 0', color: opt.quality === 'wrong' ? 'var(--muted)' : 'var(--ink)' }}>{opt.text}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </div>
  );
}

function qualityColour(q: 'good' | 'weak' | 'wrong'): string {
  return q === 'good' ? 'var(--good)' : q === 'weak' ? 'var(--warn)' : 'var(--accent)';
}
