import { useEffect, useMemo, useState } from 'react';
import type { ReportAct, ReportLevel } from '../../content/types';
import { METRICS, METRIC_LABELS, METRIC_VALUES, baseScore, severity, formatVector, parseVector, type Vector, type MetricName } from '../../engine/cvss';
import { PHASES, placeArtifact, readFinding, labChecks, type FindingDraft } from '../../sim/report';
import { ARENA_APPS, runApp, loginWithFilterEnv, listing, type Reply } from '../../sim/arena';
import { EVIDENCE } from '../../content/evidence';
import { useStore } from '../../state/store';
import { play } from '../../engine/audio';
import { Panes } from '../Panes';
import { Editor } from '../Editor';
import type { SandboxProps, CheckState } from '../types';

export function ReportSandbox(props: SandboxProps<ReportLevel, ReportAct>) {
  switch (props.level.panel) {
    case 'phases':
      return <PhasesPanel {...props} />;
    case 'cvss':
      return <CvssPanel {...props} />;
    case 'finding':
      return <FindingPanel {...props} />;
    case 'retest':
      return <RetestPanel {...props} />;
    case 'lab':
      return <LabPanel {...props} />;
  }
}

// ---- Phases ------------------------------------------------------------------

function PhasesPanel({ level, onChecks, fail, act }: SandboxProps<ReportLevel, ReportAct>) {
  const artifacts = level.panel === 'phases' ? level.artifacts : [];
  const [placed, setPlaced] = useState<(string | null)[]>(PHASES.map(() => null));
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);

  useEffect(() => {
    onChecks({
      'scope-first': placed[0] === 'roe',
      order: placed.every((id, i) => id !== null && artifacts.find((a) => a.id === id)?.phase === i),
    });
  }, [placed, artifacts, onChecks]);

  const place = (id: string, slot: number) => {
    const a = artifacts.find((x) => x.id === id);
    if (!a) return;
    const verdict = placeArtifact(a, slot, placed);
    if (!verdict.ok) {
      fail(verdict.reason);
      return;
    }
    play('hit');
    setPlaced((p) => p.map((x, i) => (i === slot ? id : x)));
    setPicked(null);
  };

  useEffect(() => {
    if (act?.act.place) place(act.act.place[0], act.act.place[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const tray = artifacts.filter((a) => !placed.includes(a.id));
  return (
    <Panes
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)' }}
      panes={[
        {
          id: 'tray',
          label: 'Work products',
          head: <h2>What the engagement produced</h2>,
          body: (
            <ul className="rowlist">
              {tray.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="commit"
                    aria-pressed={picked === a.id}
                    onClick={() => {
                      setPicked(a.id);
                      setFocus({ id: 'timeline', nonce: Date.now() });
                    }}
                  >
                    <span className="grow">
                      {a.label}
                      <span className="check-detail">{a.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
              {tray.length === 0 ? <li className="pane-pad small muted">Everything is on the timeline.</li> : null}
            </ul>
          ),
        },
        {
          id: 'timeline',
          label: 'Timeline',
          head: <h2>{picked ? `Place: ${artifacts.find((a) => a.id === picked)?.label}` : 'The six phases'}</h2>,
          body: (
            <ol className="rowlist timeline">
              {PHASES.map((ph, i) => {
                const a = artifacts.find((x) => x.id === placed[i]);
                return (
                  <li key={ph}>
                    <button type="button" className="slot" disabled={!picked || !!a} onClick={() => picked && place(picked, i)} data-filled={!!a}>
                      <span className="mono small" style={{ color: 'var(--accent-text)' }}>{i + 1}</span>
                      <span className="grow">
                        {ph}
                        <span className="check-detail">{a ? a.label : picked ? 'Place it here' : 'Empty'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          ),
        },
      ]}
    />
  );
}

// ---- CVSS calculator (used by two levels) ----------------------------------

const START_VECTOR: Vector = { AV: 'P', AC: 'H', PR: 'H', UI: 'R', S: 'U', C: 'N', I: 'N', A: 'N' };

export function CvssCalc({ vector, onChange, compact }: { vector: Vector; onChange: (v: Vector) => void; compact?: boolean }) {
  const score = baseScore(vector);
  return (
    <div className="cvss">
      <div className="cvss-score" aria-live="polite">
        <span key={score} className="pop mono">{score.toFixed(1)}</span>
        <span>
          <strong>{severity(score)}</strong>
          <span className="check-detail mono" style={{ overflowWrap: 'anywhere' }}>{formatVector(vector)}</span>
        </span>
      </div>
      <div className={compact ? 'cvss-grid compact' : 'cvss-grid'}>
        {METRICS.map((m) => (
          <div key={m} className="cvss-row">
            <span className="small" style={{ fontWeight: 600 }}>{METRIC_LABELS[m].name}</span>
            <div className="seg" role="group" aria-label={METRIC_LABELS[m].name}>
              {METRIC_VALUES[m].map((v) => (
                <button key={v} type="button" aria-pressed={vector[m] === v} onClick={() => onChange({ ...vector, [m]: v })}>
                  {METRIC_LABELS[m].values[v]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CvssPanel({ level, onChecks, act }: SandboxProps<ReportLevel, ReportAct>) {
  const lv = level.panel === 'cvss' ? level : null;
  const target = useMemo(() => parseVector(lv?.target ?? 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N'), [lv]);
  const [v, setV] = useState<Vector>(START_VECTOR);
  useEffect(() => {
    const groupOk = (ms: MetricName[]) => ms.every((m) => v[m] === target[m]);
    onChecks({
      exploitability: { pass: groupOk(['AV', 'AC', 'PR', 'UI']), detail: groupOk(['AV', 'AC', 'PR', 'UI']) ? undefined : 'At least one of these does not match the evidence yet.' },
      impact: { pass: groupOk(['S', 'C', 'I', 'A']), detail: groupOk(['S', 'C', 'I', 'A']) ? undefined : 'At least one of these does not match the evidence yet.' },
    });
  }, [v, target, onChecks]);
  useEffect(() => {
    if (act?.act.vector) setV((x) => ({ ...x, ...act.act.vector }));
  }, [act]);
  if (!lv) return null;
  return (
    <Panes
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.6fr)' }}
      panes={[
        {
          id: 'case',
          label: 'Evidence',
          head: <h2>{lv.caseTitle}</h2>,
          body: (
            <div className="pane-pad">
              <p style={{ marginTop: 0, fontSize: '0.9375rem', lineHeight: 1.5 }}>{lv.caseBody}</p>
              <ul className="rowlist">
                {lv.facts.map((f) => (
                  <li key={f.metric} className="row" style={{ padding: '7px 0', alignItems: 'flex-start' }}>
                    <span className="mono small" style={{ color: 'var(--accent-text)', minWidth: 26 }}>{f.metric}</span>
                    <span className="small">{f.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ),
        },
        { id: 'calc', label: 'Calculator', head: <h2>CVSS 3.1 calculator</h2>, body: <div className="pane-pad"><CvssCalc vector={v} onChange={setV} /></div> },
      ]}
    />
  );
}

// ---- The finding -------------------------------------------------------------

const EMPTY: FindingDraft = { title: '', asset: '', vector: formatVector(START_VECTOR), description: '', impact: '', evidence: [], fix: '' };

function FindingPanel({ onChecks, act }: SandboxProps<ReportLevel, ReportAct>) {
  const { save } = useStore();
  const [d, setD] = useState<FindingDraft>(EMPTY);
  const [verdict, setVerdict] = useState<ReturnType<typeof readFinding> | null>(null);
  const [sends, setSends] = useState(0);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const vector = useMemo(() => parseVector(d.vector), [d.vector]);

  useEffect(() => {
    if (!verdict) {
      onChecks({});
      return;
    }
    onChecks(Object.fromEntries(verdict.map((c): [string, CheckState] => [c.id, { pass: c.pass, detail: c.pass ? undefined : c.detail }])));
  }, [verdict, onChecks]);

  const send = (draft: FindingDraft) => {
    play('blip');
    setVerdict(readFinding(draft));
    setSends((n) => n + 1);
    setFocus({ id: 'client', nonce: Date.now() });
  };

  useEffect(() => {
    if (!act) return;
    const next = act.act.draft ? { ...d, ...act.act.draft } : d;
    setD(next);
    if (act.act.send) send(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const set = (k: keyof FindingDraft) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const toggleEv = (id: string) => setD((x) => ({ ...x, evidence: x.evidence.includes(id) ? x.evidence.filter((e) => e !== id) : [...x.evidence, id] }));
  // Everything is in the locker: what the player collected, the rest from the case file.
  const locker = EVIDENCE;

  return (
    <Panes
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.5fr) minmax(0, 0.9fr)' }}
      panes={[
        {
          id: 'locker',
          label: 'Evidence',
          head: <h2>Evidence locker</h2>,
          body: (
            <ul className="rowlist">
              {locker.map((e) => (
                <li key={e.id} className="pane-pad" style={{ paddingBlock: 10 }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span className="grow small" style={{ fontWeight: 600 }}>
                      {e.title}
                      <span className="check-detail">{save.evidence.includes(e.id) ? 'You collected this' : e.from ? 'From the case file' : 'Scanner output'}</span>
                    </span>
                    <button type="button" className="cbtn cbtn-sm" aria-pressed={d.evidence.includes(e.id)} onClick={() => toggleEv(e.id)}>
                      {d.evidence.includes(e.id) ? 'Attached' : 'Attach'}
                    </button>
                  </div>
                  <pre className="raw-pre" style={{ padding: '6px 0 0', fontSize: '0.75rem' }}>{e.body}</pre>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: 'draft',
          label: 'Finding',
          head: (
            <>
              <h2>Finding draft</h2>
              <span className="spacer" />
              <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={() => send(d)}>Send to the client</button>
            </>
          ),
          body: (
            <div className="pane-pad stack-12">
              <label><span className="lbl">Title</span><input className="field" value={d.title} onChange={set('title')} /></label>
              <label><span className="lbl">Asset</span><input className="field mono" value={d.asset} onChange={set('asset')} placeholder="METHOD https://host/path" /></label>
              <div>
                <span className="lbl">Severity</span>
                <CvssCalc vector={vector} onChange={(v) => setD((x) => ({ ...x, vector: formatVector(v) }))} compact />
              </div>
              <label><span className="lbl">Description</span><textarea className="field" rows={3} value={d.description} onChange={set('description')} /></label>
              <label><span className="lbl">Impact</span><textarea className="field" rows={2} value={d.impact} onChange={set('impact')} /></label>
              <div>
                <span className="lbl">Evidence</span>
                <p className="small" style={{ margin: 0 }}>{d.evidence.length ? d.evidence.map((id) => EVIDENCE.find((e) => e.id === id)?.title).join('; ') : 'Nothing attached. Use the locker.'}</p>
              </div>
              <label><span className="lbl">Fix</span><textarea className="field" rows={2} value={d.fix} onChange={set('fix')} /></label>
            </div>
          ),
        },
        {
          id: 'client',
          label: 'Client',
          dot: !!verdict,
          head: <h2>Claire, the client's CTO</h2>,
          body: (
            <div className="pane-pad">
              {!verdict ? (
                <p className="small muted" style={{ marginTop: 0 }}>Send the draft and Claire reads it, field by field.</p>
              ) : (
                <ul className="rowlist" key={sends}>
                  {verdict.map((c) => (
                    <li key={c.id} className="slide-in" style={{ padding: '8px 0' }}>
                      <span className="small" style={{ fontWeight: 650, color: c.pass ? 'var(--good-ink)' : 'var(--bad-ink)', textTransform: 'capitalize' }}>{c.id}</span>
                      <span className="check-detail" style={{ color: '#d4d4cf' }}>{c.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}

// ---- Retest ------------------------------------------------------------------

type Replayed = { id: 'original' | 'variant-0' | 'variant-1'; reply: Reply };

const RETEST_LABELS: Record<Replayed['id'], string> = {
  original: 'The recorded attack: ends the string and comments out the password check',
  'variant-0': 'Variant: ends the string and adds an always-true condition',
  'variant-1': 'Variant: a quote in both fields',
};

function RetestPanel({ level, onChecks, fail, act }: SandboxProps<ReportLevel, ReportAct>) {
  const clientCode = level.panel === 'retest' ? level.clientCode : '';
  const app = ARENA_APPS.login;
  const [runs, setRuns] = useState<Replayed[]>([]);
  const [status, setStatus] = useState<'open' | 'fixed' | 'not-fixed'>('open');
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const bypass = runs.some((r) => r.id !== 'original' && r.reply.harmed);
  useEffect(() => {
    onChecks({
      replayed: runs.some((r) => r.id === 'original'),
      bypass,
      verdict: bypass && status === 'not-fixed',
    });
  }, [runs, bypass, status, onChecks]);

  const replay = (id: Replayed['id']) => {
    const input = id === 'original' ? app.attack : app.variants[id === 'variant-0' ? 0 : 1]!;
    const reply = runApp('login', clientCode, input, loginWithFilterEnv);
    play(reply.harmed ? 'miss' : 'hit');
    setRuns((r) => [...r, { id, reply }]);
    setFocus({ id: 'replays', nonce: Date.now() });
  };
  const choose = (s: 'open' | 'fixed' | 'not-fixed') => {
    setStatus(s);
    if (s === 'fixed') fail(bypass ? 'A variant still got in: the query is still built from the input.' : 'You have only replayed the one attack they filtered. Try its variants first.');
  };
  useEffect(() => {
    if (!act) return;
    if (act.act.retest) replay(act.act.retest);
    if (act.act.status) choose(act.act.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const lines = listing({ ...app, code: { ...app.code, edit: clientCode } }, clientCode).lines;
  return (
    <Panes
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
      panes={[
        {
          id: 'replays',
          label: 'Retest',
          head: <h2>Finding: SQL injection in the login form</h2>,
          body: (
            <div className="pane-pad stack-12">
              <div>
                <span className="lbl">Replay against the patched login</span>
                <div className="stack-12" style={{ gap: 6 }}>
                  {(Object.keys(RETEST_LABELS) as Replayed['id'][]).map((id) => (
                    <button key={id} type="button" className="cbtn" style={{ justifyContent: 'flex-start', height: 'auto', minHeight: 36, padding: '8px 12px', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => replay(id)}>
                      {RETEST_LABELS[id]}
                    </button>
                  ))}
                </div>
              </div>
              <ol className="replay-steps" style={{ marginTop: 0 }}>
                {runs.map((r, i) => (
                  <li key={i} className="slide-in" data-harm={String(!!r.reply.harmed)}>
                    <span className="who">{r.id === 'original' ? 'Recorded' : 'Variant'}</span>
                    <span>{r.reply.harmed ? 'Got in: Welcome, admin (admin).' : r.reply.status === 400 ? 'Blocked by their filter (400).' : `Refused (${r.reply.status}).`}</span>
                  </li>
                ))}
              </ol>
              <div>
                <span className="lbl">Status of the finding</span>
                <div className="seg" role="group" aria-label="Finding status">
                  {(['open', 'fixed', 'not-fixed'] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={status === s} onClick={() => choose(s)}>
                      {s === 'open' ? 'Open' : s === 'fixed' ? 'Fixed' : 'Not fixed'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ),
        },
        {
          id: 'change',
          label: 'Their change',
          head: <h2>The developers' change</h2>,
          body: (
            <ol className="codelist">
              {lines.map((l, i) => (
                <li key={i}>
                  <span className="codeline" data-state={l.region === 'edit' && i === 2 ? 'fault' : undefined} style={{ cursor: 'default' }}>
                    <span className="ln">{i + 1}</span>
                    <span className="tx">{l.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          ),
        },
      ]}
    />
  );
}

// ---- Lab ----------------------------------------------------------------------

function LabPanel({ level, onChecks, fail, act }: SandboxProps<ReportLevel, ReportAct>) {
  const [text, setText] = useState(level.panel === 'lab' ? level.compose : '');
  const [ran, setRan] = useState<{ ok: boolean; lines: string[]; n: number } | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const r = useMemo(() => labChecks(text), [text]);
  useEffect(() => {
    const map: Record<string, CheckState> = Object.fromEntries(r.checks.map((c) => [c.id, { pass: c.pass, detail: c.detail }]));
    map.run = { pass: !!ran?.ok, detail: ran && !ran.ok ? 'The last run failed: fix the file and run again.' : undefined };
    onChecks(map);
  }, [r, ran, onChecks]);

  const runIt = (src = text) => {
    const res = labChecks(src);
    const allOk = res.valid && res.checks.every((c) => c.pass);
    const lines = ['$ docker compose up', ...res.services.map((s) => ` Container lab-${s}-1  Created`)];
    if (!res.valid) lines.push(`error: ${res.error}`);
    else if (allOk) {
      lines.push('juice-shop-1  | info: Server listening on port 3000', 'zap-1         | Total of 96 URLs', 'zap-1         | WARN-NEW: Content Security Policy (CSP) Header Not Set [10038] x 12', 'zap-1         | WARN-NEW: Cross-Domain Misconfiguration [10098] x 9', 'zap-1         | FAIL-NEW: 0  WARN-NEW: 9  PASS: 56', 'zap-1 exited with code 2 (warnings found)');
    } else {
      const first = res.checks.find((c) => !c.pass)!;
      lines.push(first.id === 'target' || first.id === 'network' ? 'zap-1         | ERROR Failed to access the target, is it running and reachable?' : 'lab refused to start:', `  ${first.detail}`);
    }
    setRan({ ok: allOk, lines, n: Date.now() });
    setFocus({ id: 'logs', nonce: Date.now() });
    if (!allOk) fail(res.valid ? res.checks.find((c) => !c.pass)!.detail : res.error ?? 'The file could not be read.');
    else play('hit');
  };

  useEffect(() => {
    if (!act) return;
    if (act.act.text !== undefined) setText(act.act.text);
    if (act.act.run) runIt(act.act.text ?? text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  return (
    <Panes
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)' }}
      panes={[
        {
          id: 'compose',
          label: 'compose.yaml',
          head: (
            <>
              <h2>compose.yaml</h2>
              <span className="spacer" />
              <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={() => runIt()}>Run</button>
            </>
          ),
          body: <Editor label="Compose file" value={text} onChange={setText} errorLine={r.error ? Number(/Line (\d+)/.exec(r.error)?.[1] ?? 0) : null} />,
          bodyClass: 'term-body',
        },
        {
          id: 'logs',
          label: 'Logs',
          dot: !!ran,
          head: <h2>Logs</h2>,
          body: (
            <div className="term" style={{ height: '100%' }}>
              {ran ? ran.lines.map((l, i) => (
                <div key={`${ran.n}-${i}`} className={`term-line new ${l.startsWith('error') || l.includes('ERROR') ? 'err' : l.includes('PASS') ? 'ok' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
                  {l}
                </div>
              )) : <div className="term-line dim">Press Run to start the stack.</div>}
            </div>
          ),
          bodyClass: 'term-body',
        },
      ]}
    />
  );
}
