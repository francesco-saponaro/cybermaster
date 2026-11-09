import { useEffect, useMemo, useState } from 'react';
import type { CloudAct, CloudLevel } from '../../content/types';
import {
  bucketChecks,
  iamChecks,
  sgChecks,
  keyChecks,
  triageChecks,
  gatewayChecks,
  gatewayCall,
  parseGateway,
  LEAKED_KEY,
  BACKUP_KEY,
  NEW_KEY,
  type Check,
  type SgRule,
  type KeyState,
  type Verdict,
  type GatewayCall,
} from '../../sim/cloud';
import { play } from '../../engine/audio';
import { Panes } from '../Panes';
import { Editor } from '../Editor';
import type { SandboxProps, CheckState } from '../types';

const toChecks = (cs: Check[]): Record<string, CheckState> => Object.fromEntries(cs.map((c) => [c.id, { pass: c.pass, detail: c.detail }]));

function errorLine(error?: string): number | null {
  const m = /line (\d+)/.exec(error ?? '');
  return m ? Number(m[1]) : null;
}

export function CloudSandbox(props: SandboxProps<CloudLevel, CloudAct>) {
  switch (props.level.panel) {
    case 'bucket':
      return <BucketPanel {...props} />;
    case 'iam':
      return <IamPanel {...props} />;
    case 'sg':
      return <SgPanel {...props} />;
    case 'keys':
      return <KeysPanel {...props} />;
    case 'scan':
      return <ScanPanel {...props} />;
    case 'gateway':
      return <GatewayPanel {...props} />;
  }
}

function Result({ label, status, detail }: { label: string; status: number | string; detail?: string }) {
  const ok = typeof status === 'number' ? status < 300 : status === 'Allowed';
  return (
    <li className="row" style={{ padding: '8px 0', alignItems: 'flex-start' }}>
      <span className="grow small">
        {label}
        {detail ? <span className="check-detail">{detail}</span> : null}
      </span>
      <span key={String(status)} className="status slide-in" data-tone={ok ? 'good' : 'bad'}>
        {status}
      </span>
    </li>
  );
}

// ---- Bucket ----------------------------------------------------------------

function BucketPanel({ level, onChecks, act }: SandboxProps<CloudLevel, CloudAct>) {
  const initial = level.panel === 'bucket' ? level.policy : '';
  const [text, setText] = useState(initial);
  const [bpa, setBpa] = useState(false);
  const r = useMemo(() => bucketChecks(text, bpa), [text, bpa]);
  useEffect(() => onChecks(toChecks(r.checks)), [r, onChecks]);
  useEffect(() => {
    if (!act) return;
    if (act.act.text !== undefined) setText(act.act.text);
    if (act.act.bpa !== undefined) setBpa(act.act.bpa);
  }, [act]);
  return (
    <Panes
      grid={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}
      panes={[
        { id: 'policy', label: 'Bucket policy', head: <><h2>harbor-invoices: bucket policy</h2><span className="spacer" />{r.error ? <span className="status" data-tone="bad">Invalid</span> : <span className="status">JSON</span>}</>, body: <Editor label="Bucket policy JSON" value={text} onChange={setText} errorLine={errorLine(r.error)} />, bodyClass: 'term-body' },
        {
          id: 'try',
          label: 'Settings and test',
          head: <h2>Permissions</h2>,
          body: (
            <div className="pane-pad stack-12">
              <button type="button" className="switch" role="switch" aria-checked={bpa} onClick={() => { setBpa(!bpa); play('blip'); }}>
                <span className="track" aria-hidden="true" />
                Block all public access
              </button>
              <p className="small muted" style={{ margin: 0 }}>An account-level guard: when on, no policy can make this bucket public.</p>
              <hr className="hr" />
              <p className="lbl">Who can download 2026/INV-1043.pdf, right now</p>
              <ul className="rowlist">
                <Result label="Anyone on the internet, no credentials" status={r.anonymousStatus === 200 ? '200 OK' : '403 Denied'} />
                <Result label="billing-web role (the app)" status={r.appStatus === 200 ? '200 OK' : '403 Denied'} />
              </ul>
            </div>
          ),
        },
      ]}
    />
  );
}

// ---- IAM ----------------------------------------------------------------

function IamPanel({ level, onChecks, act }: SandboxProps<CloudLevel, CloudAct>) {
  const [text, setText] = useState(level.panel === 'iam' ? level.policy : '');
  const r = useMemo(() => iamChecks(text), [text]);
  useEffect(() => onChecks(toChecks(r.checks)), [r, onChecks]);
  useEffect(() => {
    if (act?.act.text !== undefined) setText(act.act.text);
  }, [act]);
  return (
    <Panes
      grid={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}
      panes={[
        { id: 'policy', label: 'Policy', head: <><h2>role/report-export: inline policy</h2><span className="spacer" />{r.error ? <span className="status" data-tone="bad">Invalid</span> : null}</>, body: <Editor label="IAM policy JSON" value={text} onChange={setText} errorLine={errorLine(r.error)} />, bodyClass: 'term-body' },
        {
          id: 'sim',
          label: 'Access simulator',
          head: <h2>Access simulator</h2>,
          body: (
            <div className="pane-pad">
              <p className="small muted" style={{ marginTop: 0 }}>Every request the role might make, against this policy. The first two are its job.</p>
              {r.error ? <p className="small" style={{ color: 'var(--bad-ink)' }}>{r.error}</p> : null}
              <ul className="rowlist">
                {r.probes.map((p, i) => (
                  <Result key={p.id} label={`${i < 2 ? 'Needed: ' : 'Not needed: '}${p.label}`} status={p.result} />
                ))}
              </ul>
            </div>
          ),
        },
      ]}
    />
  );
}

// ---- Security group ----------------------------------------------------------

let ruleSeq = 100;

function SgPanel({ level, onChecks, act }: SandboxProps<CloudLevel, CloudAct>) {
  const [rules, setRules] = useState<SgRule[]>(level.panel === 'sg' ? level.rules : []);
  const checks = useMemo(() => sgChecks(rules), [rules]);
  useEffect(() => onChecks(toChecks(checks)), [checks, onChecks]);
  useEffect(() => {
    if (act?.act.rules) setRules(act.act.rules);
  }, [act]);
  const update = (id: string, patch: Partial<SgRule>) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const byId = Object.fromEntries(checks.map((c) => [c.id, c.pass]));
  return (
    <Panes
      grid={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}
      panes={[
        {
          id: 'rules',
          label: 'Inbound rules',
          head: (
            <>
              <h2>sg-web-01: inbound rules</h2>
              <span className="spacer" />
              <button type="button" className="cbtn cbtn-sm" onClick={() => setRules((rs) => [...rs, { id: `n${ruleSeq++}`, protocol: 'tcp', ports: '', source: '', note: '' }])}>
                Add rule
              </button>
            </>
          ),
          body: (
            <ul className="rowlist sg-rows">
              {rules.map((r) => (
                <li key={r.id} className="sg-row">
                  <label>
                    <span className="lbl">Protocol</span>
                    <select className="field" value={r.protocol} onChange={(e) => update(r.id, { protocol: e.target.value as SgRule['protocol'] })}>
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                      <option value="all">All</option>
                    </select>
                  </label>
                  <label>
                    <span className="lbl">Ports</span>
                    <input className="field mono" value={r.ports} onChange={(e) => update(r.id, { ports: e.target.value })} aria-label={`Ports for ${r.note || 'new rule'}`} />
                  </label>
                  <label>
                    <span className="lbl">Source</span>
                    <input className="field mono" value={r.source} onChange={(e) => update(r.id, { source: e.target.value })} aria-label={`Source for ${r.note || 'new rule'}`} />
                  </label>
                  <label className="sg-note">
                    <span className="lbl">Description</span>
                    <input className="field" value={r.note} onChange={(e) => update(r.id, { note: e.target.value })} />
                  </label>
                  <button type="button" className="cbtn cbtn-sm sg-del" onClick={() => setRules((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Remove rule ${r.ports} from ${r.source}`}>
                    Remove
                  </button>
                </li>
              ))}
              {rules.length === 0 ? <li className="pane-pad small muted">No inbound rules: nothing can reach this server.</li> : null}
            </ul>
          ),
        },
        {
          id: 'reach',
          label: 'Who can connect',
          head: <h2>Who can connect</h2>,
          body: (
            <div className="pane-pad">
              <ul className="rowlist">
                <Result label="Internet to 443 (the website)" status={byId.web ? 'Open' : 'Closed'} />
                <Result label="Internet to 22 (SSH)" status={byId.ssh ? 'Closed' : 'Open'} />
                <Result label="Internet to 3389 (RDP)" status={byId.rdp ? 'Closed' : 'Open'} />
                <Result label="Internet to 5432 (PostgreSQL)" status={byId.db ? 'Closed' : 'Open'} />
                <Result label="Office 203.0.113.70 to 22" status={byId.office ? 'Open' : 'Closed'} />
              </ul>
              <p className="small muted">Green is what this server should allow: the site open, admin ports and the database closed to the world, SSH open to the office.</p>
            </div>
          ),
        },
      ]}
    />
  );
}

// ---- Leaked key ----------------------------------------------------------------

const COMMITS = [
  { id: 'f0b7d13', msg: 'Remove .env.production', when: '2 days ago', diff: ['--- a/.env.production', '+++ /dev/null', '-AWS_ACCESS_KEY_ID=' + LEAKED_KEY, '-AWS_SECRET_ACCESS_KEY=(40 characters)', '-AWS_REGION=eu-west-3'] },
  { id: '9c2e41a', msg: 'Add production env for deploys', when: '3 days ago', diff: ['--- /dev/null', '+++ b/.env.production', '+AWS_ACCESS_KEY_ID=' + LEAKED_KEY, '+AWS_SECRET_ACCESS_KEY=(40 characters)', '+AWS_REGION=eu-west-3'] },
  { id: 'a41c0e2', msg: 'Add the deploy workflow', when: '3 days ago', diff: ['+++ b/.github/workflows/deploy.yml', '+      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}'] },
];

function KeysPanel({ onChecks, fail, act }: SandboxProps<CloudLevel, CloudAct>) {
  const [s, setS] = useState<KeyState>({
    keys: [
      { id: LEAKED_KEY, status: 'Active', created: '2026-11-06' },
      { id: BACKUP_KEY, status: 'Active', created: '2026-03-14' },
    ],
    ciKey: LEAKED_KEY,
    backupKey: BACKUP_KEY,
    found: false,
  });
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const checks = useMemo(() => keyChecks(s), [s]);
  useEffect(() => onChecks(toChecks(checks)), [checks, onChecks]);

  const openCommit = (id: string) => {
    setOpen(id);
    if (id === '9c2e41a' || id === 'f0b7d13') setS((x) => ({ ...x, found: true }));
  };
  const create = () => {
    if (s.keys.some((k) => k.id === NEW_KEY)) return;
    setS((x) => ({ ...x, keys: [...x.keys, { id: NEW_KEY, status: 'Active', created: '2026-11-09' }] }));
    play('blip');
  };
  const setStatus = (id: string, status: 'Active' | 'Inactive' | 'Deleted') => {
    const cur = s.keys.find((k) => k.id === id);
    if (status !== 'Active' && cur?.status === 'Active') {
      if (id === s.backupKey) fail('Backups just failed: that key belonged to the nightly backup job.');
      else if (id === s.ciKey) fail('Deploys just broke: move the pipeline to a new key before switching the old one off.');
    }
    setS((x) => ({ ...x, keys: status === 'Deleted' ? x.keys.filter((k) => k.id !== id) : x.keys.map((k) => (k.id === id ? { ...k, status } : k)) }));
  };
  const setCi = (id: string) => setS((x) => ({ ...x, ciKey: id }));

  useEffect(() => {
    if (!act?.act.keyOp) return;
    const op = act.act.keyOp;
    if (op === 'find') {
      openCommit('9c2e41a');
      setFocus({ id: 'repo', nonce: Date.now() });
    }
    if (op === 'create') {
      create();
      setFocus({ id: 'iam', nonce: Date.now() });
    }
    if (op === 'ci-new') setS((x) => ({ ...x, ciKey: NEW_KEY, keys: x.keys.some((k) => k.id === NEW_KEY) ? x.keys : [...x.keys, { id: NEW_KEY, status: 'Active', created: '2026-11-09' }] }));
    if (op === 'deactivate-leaked') setS((x) => ({ ...x, keys: x.keys.map((k) => (k.id === LEAKED_KEY ? { ...k, status: 'Inactive' } : k)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const commit = COMMITS.find((c) => c.id === open);
  const byId = Object.fromEntries(checks.map((c) => [c.id, c.pass]));
  return (
    <Panes
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
      panes={[
        {
          id: 'repo',
          label: 'Repository',
          head: <h2>harbor/booking-api: history</h2>,
          body: (
            <div>
              <ul className="rowlist">
                {COMMITS.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="commit" aria-expanded={open === c.id} onClick={() => openCommit(c.id)}>
                      <span className="mono small" style={{ color: 'var(--accent-text)' }}>{c.id}</span>
                      <span className="grow">{c.msg}</span>
                      <span className="small muted">{c.when}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {commit ? (
                <pre className="raw-pre slide-in" style={{ borderTop: '1px solid var(--line)' }}>
                  {commit.diff.map((l, i) => (
                    <div key={i} style={{ color: l.startsWith('+') && !l.startsWith('+++') ? 'var(--good-ink)' : l.startsWith('-') && !l.startsWith('---') ? 'var(--bad-ink)' : undefined }}>
                      {l}
                    </div>
                  ))}
                </pre>
              ) : (
                <p className="pane-pad small muted">The current files have no keys in them. Open a commit to see what it changed.</p>
              )}
            </div>
          ),
        },
        {
          id: 'iam',
          label: 'Keys and pipeline',
          head: (
            <>
              <h2>user/deploy-bot: access keys</h2>
              <span className="spacer" />
              <button type="button" className="cbtn cbtn-sm" onClick={create} disabled={s.keys.some((k) => k.id === NEW_KEY)}>
                Create key
              </button>
            </>
          ),
          body: (
            <div className="pane-pad stack-12">
              <ul className="rowlist">
                {s.keys.map((k) => (
                  <li key={k.id} className="wrap-row" style={{ padding: '8px 0' }}>
                    <span className="grow mono small" style={{ minWidth: 190 }}>
                      {k.id}
                      <span className="check-detail">{k.id === s.backupKey ? 'used by the backup job' : k.id === s.ciKey ? 'used by the deploy pipeline' : `created ${k.created}`}</span>
                    </span>
                    <span className="status" data-tone={k.status === 'Active' ? 'good' : undefined}>{k.status}</span>
                    {k.status === 'Active' ? (
                      <button type="button" className="cbtn cbtn-sm" onClick={() => setStatus(k.id, 'Inactive')}>Deactivate</button>
                    ) : (
                      <button type="button" className="cbtn cbtn-sm" onClick={() => setStatus(k.id, 'Active')}>Activate</button>
                    )}
                    <button type="button" className="cbtn cbtn-sm" onClick={() => setStatus(k.id, 'Deleted')}>Delete</button>
                  </li>
                ))}
              </ul>
              <label>
                <span className="lbl">Pipeline secret AWS_ACCESS_KEY_ID</span>
                <select className="field mono" value={s.ciKey} onChange={(e) => setCi(e.target.value)}>
                  {[...new Set([s.ciKey, ...s.keys.map((k) => k.id)])].map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </label>
              <ul className="rowlist">
                <Result label="Deploy pipeline" status={byId.deploys ? 'Passing' : 'Failing'} />
                <Result label="Nightly backup" status={byId.backups ? 'Passing' : 'Failing'} />
              </ul>
            </div>
          ),
        },
      ]}
    />
  );
}

// ---- Code scan -------------------------------------------------------------------

function ScanPanel({ level, onChecks, fail, act }: SandboxProps<CloudLevel, CloudAct>) {
  const findings = level.panel === 'scan' ? level.findings : [];
  const [sel, setSel] = useState(findings[0]?.id ?? '');
  const [traced, setTraced] = useState<Record<string, boolean>>({});
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | undefined>>({});
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const checks = useMemo(() => triageChecks(findings, verdicts), [findings, verdicts]);
  useEffect(() => onChecks(toChecks(checks)), [checks, onChecks]);
  useEffect(() => {
    if (!act) return;
    if (act.act.trace) {
      setSel(act.act.trace);
      setTraced((t) => ({ ...t, [act.act.trace!]: true }));
    }
    if (act.act.verdicts) setVerdicts(act.act.verdicts);
  }, [act]);
  const f = findings.find((x) => x.id === sel);
  const decide = (v: Verdict) => {
    if (!f) return;
    setVerdicts((x) => ({ ...x, [f.id]: v }));
    if (v !== f.truth) fail(f.why);
    else play('blip');
  };
  return (
    <Panes
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)' }}
      panes={[
        {
          id: 'alerts',
          label: 'Alerts',
          head: <h2>Code scan: 5 alerts</h2>,
          body: (
            <ul className="rowlist">
              {findings.map((x) => (
                <li key={x.id}>
                  <button type="button" className="commit" aria-pressed={sel === x.id} onClick={() => { setSel(x.id); setFocus({ id: 'code', nonce: Date.now() }); }}>
                    <span className="status" data-tone={x.severity === 'High' ? 'bad' : 'warn'}>{x.severity}</span>
                    <span className="grow">
                      <span className="mono small">{x.rule}</span>
                      <span className="check-detail">{x.file}:{x.line}</span>
                    </span>
                    <span className="small" style={{ color: verdicts[x.id] === undefined ? 'var(--muted)' : verdicts[x.id] === x.truth ? 'var(--good-ink)' : 'var(--bad-ink)' }}>
                      {verdicts[x.id] === 'fix' ? 'To fix' : verdicts[x.id] === 'dismiss' ? 'Dismissed' : 'Open'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ),
        },
        {
          id: 'code',
          label: 'Code',
          head: (
            <>
              <h2 className="mono" style={{ overflowWrap: 'anywhere' }}>{f?.file}</h2>
              <span className="spacer" />
              <button type="button" className="cbtn cbtn-sm" onClick={() => f && setTraced((t) => ({ ...t, [f.id]: true }))}>Trace</button>
            </>
          ),
          body: f ? (
            <div>
              <ol className="codelist">
                {f.code.map((l, i) => (
                  <li key={i}>
                    <span className="codeline" data-state={traced[f.id] && f.trace.includes(i) ? 'fault' : undefined} style={{ cursor: 'default' }}>
                      <span className="ln">{f.line + i - (f.trace[f.trace.length - 1] ?? 0)}</span>
                      <span className="tx">{l}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {traced[f.id] ? <p className="pane-pad small slide-in" style={{ margin: 0 }}>Trace: {f.traceNote}</p> : <p className="pane-pad small muted" style={{ margin: 0 }}>Trace follows the data from where it enters to the flagged line.</p>}
              <div className="row pane-pad" style={{ borderTop: '1px solid var(--line)' }}>
                <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={() => decide('fix')}>Send to fix</button>
                <button type="button" className="cbtn cbtn-sm" onClick={() => decide('dismiss')}>Dismiss as false alarm</button>
              </div>
            </div>
          ) : null,
        },
      ]}
    />
  );
}

// ---- Gateway -------------------------------------------------------------------

const CALLS: { label: string; call: Omit<GatewayCall, 'token'> }[] = [
  { label: 'POST /v1/login', call: { method: 'POST', path: '/v1/login' } },
  { label: 'GET /v1/orders', call: { method: 'GET', path: '/v1/orders' } },
  { label: 'GET /v1/orders/7001', call: { method: 'GET', path: '/v1/orders/7001' } },
  { label: 'GET /v1/orders/7003', call: { method: 'GET', path: '/v1/orders/7003' } },
  { label: 'GET /internal/export', call: { method: 'GET', path: '/internal/export' } },
];

function GatewayPanel({ level, onChecks, act }: SandboxProps<CloudLevel, CloudAct>) {
  const [text, setText] = useState(level.panel === 'gateway' ? level.config : '');
  const [callIx, setCallIx] = useState(4);
  const [token, setToken] = useState<GatewayCall['token']>('none');
  const [result, setResult] = useState<{ status: number; body: string; n: number } | null>(null);
  const r = useMemo(() => gatewayChecks(text), [text]);
  useEffect(() => onChecks(toChecks(r.checks)), [r, onChecks]);
  useEffect(() => {
    if (act?.act.text !== undefined) setText(act.act.text);
  }, [act]);
  const send = () => {
    const parsed = parseGateway(text);
    if (!parsed.ok) {
      setResult({ status: 500, body: parsed.error, n: Date.now() });
      return;
    }
    play('blip');
    setResult({ ...gatewayCall(parsed.routes, { ...CALLS[callIx]!.call, token }), n: Date.now() });
  };
  return (
    <Panes
      grid={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}
      panes={[
        { id: 'config', label: 'Gateway config', head: <><h2>api-gateway.json</h2><span className="spacer" />{r.error ? <span className="status" data-tone="bad">Invalid</span> : null}</>, body: <Editor label="Gateway config JSON" value={text} onChange={setText} />, bodyClass: 'term-body' },
        {
          id: 'try',
          label: 'Try it',
          head: (
            <>
              <h2>Try it</h2>
              <span className="spacer" />
              <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={send}>Send</button>
            </>
          ),
          body: (
            <div className="pane-pad stack-12">
              <label>
                <span className="lbl">Request</span>
                <select className="field mono" value={callIx} onChange={(e) => setCallIx(Number(e.target.value))}>
                  {CALLS.map((c, i) => (
                    <option key={c.label} value={i}>{c.label}</option>
                  ))}
                </select>
              </label>
              <div>
                <span className="lbl">Caller</span>
                <div className="seg" role="group" aria-label="Caller">
                  {(['none', 'sam', 'export-job'] as const).map((t) => (
                    <button key={t} type="button" aria-pressed={token === t} onClick={() => setToken(t)}>
                      {t === 'none' ? 'Anonymous' : t === 'sam' ? 'Sam (customer)' : 'Export job'}
                    </button>
                  ))}
                </div>
              </div>
              {result ? (
                <div key={result.n} className="slide-in">
                  <span className="status" data-tone={result.status < 300 ? 'good' : 'bad'}>{result.status}</span>
                  <pre className="raw-pre" style={{ padding: '8px 0 0' }}>{result.body}</pre>
                </div>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>Pick a request and a caller, then Send.</p>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
