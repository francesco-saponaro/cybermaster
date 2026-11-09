import { useMemo, useState } from 'react';
import type { CvssMission } from '../content/types';
import { METRICS, METRIC_LABELS, METRIC_VALUES, baseScore, formatVector, parseVector, severity, compareVectors, type Vector, type MetricName } from '../engine/cvss';
import { cvssScore, clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

const SEV_COLOUR: Record<string, string> = {
  None: 'var(--muted)',
  Low: 'var(--good)',
  Medium: 'var(--warn)',
  High: 'var(--accent)',
  Critical: 'var(--accent)',
};

function startVector(): Vector {
  return Object.fromEntries(METRICS.map((m) => [m, METRIC_VALUES[m][0]])) as Vector;
}

// CVSS Forge: eight dials, each a row of value buttons. The live score settles
// as you set them. Scored against the real FIRST vector for the case.
export function CvssMissionView({ mission, onFinish }: { mission: CvssMission; onFinish: (score: number) => void }) {
  const [caseIndex, setCaseIndex] = useState(0);
  const [vector, setVector] = useState<Vector>(startVector);
  const [results, setResults] = useState<number[]>([]);
  const [revealed, setRevealed] = useState(false);

  const current = mission.cases[caseIndex]!;
  const target = useMemo(() => parseVector(current.vector), [current.vector]);
  const score = baseScore(vector);
  const sev = severity(score);

  function set(metric: MetricName, value: string) {
    if (revealed) return;
    setVector((v) => ({ ...v, [metric]: value }));
    play('blip');
  }

  function lockIn() {
    const { matched, scoreGap } = compareVectors(vector, target);
    const s = cvssScore(matched, scoreGap);
    play(s >= 75 ? 'hit' : 'miss');
    setResults((r) => [...r, s]);
    setRevealed(true);
  }

  function next() {
    if (caseIndex + 1 >= mission.cases.length) {
      const all = [...results];
      onFinish(clampScore(all.reduce((a, b) => a + b, 0) / all.length));
    } else {
      setCaseIndex((i) => i + 1);
      setVector(startVector());
      setRevealed(false);
    }
  }

  const targetScore = baseScore(target);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <span className="tag" data-tone="accent">
          Case {caseIndex + 1} of {mission.cases.length}
        </span>
        <h2 style={{ fontSize: '1.15rem' }}>{current.title}</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 18 }}>
        <p className="panel" style={{ padding: '14px 16px', borderRadius: 'var(--r-sm)', margin: 0 }}>
          {current.description}
        </p>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 340px' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              {METRICS.map((m) => (
                <div key={m} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem' }}>
                    {METRIC_LABELS[m].name}
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {METRIC_VALUES[m].map((val) => {
                      const sel = vector[m] === val;
                      const isTarget = revealed && target[m] === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => set(m, val)}
                          disabled={revealed}
                          className="panel-2"
                          aria-pressed={sel}
                          title={METRIC_LABELS[m].values[val]}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--r-sm)',
                            border: `1px solid ${isTarget ? 'var(--good)' : sel ? 'var(--accent)' : 'var(--line)'}`,
                            background: sel ? 'color-mix(in srgb, var(--accent) 20%, var(--surface))' : 'var(--surface-2)',
                            color: 'var(--ink)',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: revealed ? 'default' : 'pointer',
                          }}
                        >
                          {METRIC_LABELS[m].values[val]}
                          {isTarget && !sel ? ' (answer)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ flex: '0 0 180px', textAlign: 'center' }}>
            <div className="panel" style={{ padding: 18, position: 'sticky', top: 80 }}>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.8rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>Base score</p>
              <p className="tnum" style={{ margin: '4px 0', fontSize: '2.6rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: SEV_COLOUR[sev] }}>
                {score.toFixed(1)}
              </p>
              <span className="tag" data-tone={sev === 'Low' ? 'good' : sev === 'Medium' ? 'warn' : 'accent'}>
                {sev}
              </span>
              <p className="raw" style={{ fontSize: '0.68rem', marginTop: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>
                {formatVector(vector)}
              </p>
            </div>
          </div>
        </div>

        {revealed ? (
          <div className="panel pop" style={{ padding: '14px 16px', borderRadius: 'var(--r-sm)' }}>
            <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Target: {targetScore.toFixed(1)} {severity(targetScore)} ({results[results.length - 1]}/100 on this case)
            </p>
            <p style={{ margin: 0 }}>{current.explain}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={next} style={{ marginTop: 12 }}>
              {caseIndex + 1 >= mission.cases.length ? 'Finish' : 'Next case'}
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-primary" onClick={lockIn} style={{ justifySelf: 'start' }}>
            Lock in the vector
          </button>
        )}
      </div>
    </div>
  );
}
