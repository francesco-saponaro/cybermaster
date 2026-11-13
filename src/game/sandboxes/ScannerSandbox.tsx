import { useEffect, useMemo, useReducer, useState } from 'react';
import type { ScannerAct, ScannerLevel } from '../../content/types';
import {
  ALIVE_TESTS,
  PORT_LISTS,
  QOD_TYPES,
  SCAN_CONFIGS,
  TODAY,
  VTS,
  daysBetween,
  delta,
  effectiveCvss,
  initialGvm,
  reduceGvm,
  resultKey,
  severityLabel,
  visibleResults,
  inKev,
  KEV_BY_CVE,
  type AliveTest,
  type GvmAction,
  type GvmState,
  type PortListId,
  type Report,
  type Result,
  type ScanConfig,
  type Tab,
} from '../../sim/gvm';
import { play } from '../../engine/audio';
import { Panes } from '../Panes';
import { StartHint } from '../StartHint';
import type { SandboxProps } from '../types';
import '../../styles/scanner.css';

const TABS: { id: Tab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'vts', label: 'VTs' },
  { id: 'targets', label: 'Targets' },
  { id: 'credentials', label: 'Credentials' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'results', label: 'Results' },
  { id: 'kev', label: 'KEV' },
];

const START_HINTS: Record<Tab, string> = {
  feed: 'Start here: read the feed status, then sync it.',
  vts: 'Start here: type a CVE number and press Search.',
  targets: 'Start here: read the scope note, then fill in the target.',
  credentials: 'Start here: create the scan login.',
  tasks: 'Start here: set up the task, then press Start.',
  results: 'Start here: the latest report is below.',
  kev: 'Start here: search the catalog for a CVE number.',
};

type Model = { s: GvmState; error: { text: string; n: number } | null };
type TargetDraft = { id?: string; name: string; hosts: string; exclude: string; portList: PortListId; alive: AliveTest; sshCredential: string | null };

function SevBadge({ cvss }: { cvss: number }) {
  const label = severityLabel(cvss);
  return (
    <span className="gvm-sev" data-sev={label.replace(' ', '-').toLowerCase()}>
      {label}
      {cvss > 0 ? <b>{cvss.toFixed(1)}</b> : null}
    </span>
  );
}

export function ScannerSandbox({ level, onChecks, fail, act }: SandboxProps<ScannerLevel, ScannerAct>) {
  const setup = level.setup;
  const [m, dispatch] = useReducer(
    (m: Model, a: GvmAction): Model => {
      const r = reduceGvm(setup, m.s, a);
      return { s: r.state, error: r.error ? { text: r.error, n: (m.error?.n ?? 0) + 1 } : m.error };
    },
    undefined,
    () => ({ s: initialGvm(setup), error: null }),
  );
  const s = m.s;
  const [tab, setTab] = useState<Tab>(level.startTab);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showDelta, setShowDelta] = useState(false);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);

  useEffect(() => {
    onChecks(level.evaluate(s));
  }, [s, level, onChecks]);

  useEffect(() => {
    if (m.error) {
      fail(m.error.text);
      play('miss');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.error?.n]);

  // Syncs and scans move on a timer.
  const busy = s.feed.syncing > 0 || s.tasks.some((t) => t.status === 'Running');
  useEffect(() => {
    if (!busy) return undefined;
    const id = window.setInterval(() => dispatch({ t: 'tick' }), 550);
    return () => window.clearInterval(id);
  }, [busy]);

  const judge = (text: string) => {
    const q = level.question;
    if (!q || !text.trim()) return;
    const n = text.trim().toLowerCase().replace(/\s+/g, '');
    const ok = q.answers.some((a) => a.toLowerCase().replace(/\s+/g, '') === n);
    dispatch({ t: 'answer', text });
    if (ok) play('blip');
    else fail(q.wrong?.find((w) => w.answers.some((a) => a.toLowerCase() === n))?.reason ?? q.otherwise);
  };

  // Show me: open the page and do what the step says.
  useEffect(() => {
    if (!act) return;
    if (act.act.tab) setTab(act.act.tab);
    for (const a of act.act.actions ?? []) {
      dispatch(a);
      if (a.t === 'see' && a.what.startsWith('result:')) {
        setOpenKey(a.what.slice(7));
        setShowDelta(false);
      }
      if (a.t === 'delta') {
        setShowDelta(true);
        setOpenKey(null);
      }
    }
    if (act.act.answer) judge(act.act.answer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const reports = s.reports;
  const report = reports[reports.length - 1];
  const open = report?.results.find((r) => resultKey(r) === openKey) ?? null;

  const openResult = (r: Result) => {
    setOpenKey(resultKey(r));
    setShowDelta(false);
    dispatch({ t: 'see', what: `result:${resultKey(r)}` });
    setFocus({ id: 'details', nonce: Date.now() });
  };

  const consoleView = (
    <div className="gvm">
      <nav className="gvm-nav" aria-label="Console pages">
        {TABS.filter((t) => t.id !== 'kev' || level.kev).map((t) => (
          <button key={t.id} type="button" className="gvm-tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)} data-testid={`gvm-tab-${t.id}`}>
            {t.label}
            {t.id === 'feed' && s.feed.syncing ? <span className="gvm-dot" aria-label="(syncing)" /> : null}
            {t.id === 'tasks' && s.tasks.some((x) => x.status === 'Running') ? <span className="gvm-dot" aria-label="(running)" /> : null}
          </button>
        ))}
      </nav>
      <div className="gvm-page">
        {tab === level.startTab ? <StartHint text={START_HINTS[tab]} arrow="down" /> : null}
        {tab === 'feed' ? <FeedPage s={s} onSync={() => dispatch({ t: 'sync' })} /> : null}
        {tab === 'vts' ? <VtsPage s={s} onSearch={(q) => dispatch({ t: 'search', q })} /> : null}
        {tab === 'targets' ? <TargetsPage s={s} scope={setup.network.scope} onSave={(t) => dispatch({ t: 'target', target: t })} /> : null}
        {tab === 'credentials' ? <CredentialsPage s={s} onSave={(c) => dispatch({ t: 'credential', cred: c })} /> : null}
        {tab === 'tasks' ? <TasksPage s={s} onSave={(t) => dispatch({ t: 'task', task: t })} onStart={(id) => dispatch({ t: 'start', taskId: id })} /> : null}
        {tab === 'kev' ? <KevPage onSearch={(q) => dispatch({ t: 'kev-search', q })} /> : null}
        {tab === 'results' ? (
          <ResultsPage
            s={s}
            report={report}
            openKey={openKey}
            onOpen={openResult}
            onQod={(min) => dispatch({ t: 'qod', min })}
            onDelta={() => {
              const first = reports.filter((r) => r.taskId === report!.taskId)[0]!;
              dispatch({ t: 'delta', a: first.id, b: report!.id });
              setShowDelta(true);
              setOpenKey(null);
              setFocus({ id: 'details', nonce: Date.now() });
            }}
            question={level.question?.ask}
            onAnswer={judge}
            kev={!!level.kev}
            onKev={() => dispatch({ t: 'kev-match' })}
          />
        ) : null}
      </div>
    </div>
  );

  const details = showDelta && report ? (
    <DeltaView a={reports.filter((r) => r.taskId === report.taskId)[0]!} b={report} />
  ) : open ? (
    <ResultDetail s={s} r={open} note={level.notes?.[resultKey(open)]} onOverride={(cvss, reason) => dispatch({ t: 'override', resultKey: resultKey(open), cvss, reason })} />
  ) : (
    <SideHelp tab={tab} scope={setup.network.scope} />
  );

  return (
    <Panes
      focus={focus}
      hint="console"
      grid={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)' }}
      panes={[
        { id: 'console', label: 'Greenbone', head: <h2>Greenbone console</h2>, body: consoleView, dot: busy },
        { id: 'details', label: 'Details', head: <h2>{showDelta ? 'Last week against this week' : open ? 'Result' : 'What this page is'}</h2>, body: <div className="pane-pad">{details}</div>, dot: !!open || showDelta },
      ]}
    />
  );
}

// ---- Pages ------------------------------------------------------------------------

function FeedPage({ s, onSync }: { s: GvmState; onSync: () => void }) {
  const age = daysBetween(s.feed.date, TODAY);
  const status = s.feed.syncing ? 'Updating' : age <= 2 ? 'Current' : 'Too old';
  return (
    <div className="gvm-card" data-testid="gvm-feed">
      <dl className="gvm-dl">
        <div>
          <dt>Feed</dt>
          <dd>Greenbone Community Feed</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>Vulnerability tests (VTs)</dd>
        </div>
        <div>
          <dt>Content</dt>
          <dd className="tnum">{s.feed.vts.toLocaleString('en-GB')} tests</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd className="tnum">
            {s.feed.date} <span className="muted">({age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`})</span>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className="status" data-tone={status === 'Current' ? 'good' : status === 'Updating' ? 'warn' : 'bad'}>
              {status}
            </span>
          </dd>
        </div>
      </dl>
      {s.feed.syncing ? <div className="gvm-bar" role="progressbar" aria-label="Feed sync" aria-valuenow={(4 - s.feed.syncing) * 25} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${(4 - s.feed.syncing) * 25}%` }} /></div> : null}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="cbtn cbtn-go" onClick={onSync} disabled={s.feed.syncing > 0}>
          Sync feed
        </button>
      </div>
    </div>
  );
}

function VtsPage({ s, onSearch }: { s: GvmState; onSearch: (q: string) => void }) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const hits = asked ? Object.values(VTS).filter((v) => s.found.includes(`${asked.toLowerCase()}>${v.oid}`)) : [];
  return (
    <div className="gvm-card">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q);
          setAsked(q.trim());
        }}
      >
        <label className="sr-only" htmlFor="vt-q">Search vulnerability tests</label>
        <input id="vt-q" className="field mono grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A CVE number or words from a test name" spellCheck={false} />
        <button type="submit" className="cbtn cbtn-go">
          Search
        </button>
      </form>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        The feed has {s.feed.vts.toLocaleString('en-GB')} tests, last updated {s.feed.date}.
      </p>
      {asked ? (
        hits.length ? (
          <ul className="gvm-list" data-testid="vt-hits">
            {hits.map((v) => (
              <li key={v.oid}>
                <SevBadge cvss={v.cvss} />
                <span className="grow">
                  <strong>{v.name}</strong>
                  <span className="small muted">
                    {' '}
                    {v.cve ?? ''} · {v.family} · added {v.published}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gvm-empty" data-testid="vt-none">
            No vulnerability test matches "{asked}" in this feed.
          </p>
        )
      ) : null}
    </div>
  );
}

function TargetsPage({ s, scope, onSave }: { s: GvmState; scope: string; onSave: (t: TargetDraft) => void }) {
  const current = s.targets[0];
  const [name, setName] = useState(current?.name ?? '');
  const [hosts, setHosts] = useState(current?.hosts ?? '');
  const [exclude, setExclude] = useState(current?.exclude ?? '');
  const [portList, setPortList] = useState<PortListId>(current?.portList ?? 'Web only (80, 443)');
  const [alive, setAlive] = useState<AliveTest>(current?.alive ?? 'ICMP Ping');
  const [cred, setCred] = useState<string>(current?.sshCredential ?? '');
  // Show me and other changes from outside update the form.
  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setHosts(current.hosts);
    setExclude(current.exclude);
    setPortList(current.portList);
    setAlive(current.alive);
    setCred(current.sshCredential ?? '');
  }, [current]);
  return (
    <div className="gvm-card">
      <p className="gvm-scope">
        <strong>Scope note.</strong> {scope}
      </p>
      <form
        className="gvm-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: current?.id ?? 'target-1', name, hosts, exclude, portList, alive, sshCredential: cred || null });
        }}
      >
        <label>
          <span className="lbl">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="lbl">Hosts</span>
          <input className="field mono" value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="10.0.20.0/24" spellCheck={false} />
        </label>
        <label>
          <span className="lbl">Exclude hosts</span>
          <input className="field mono" value={exclude} onChange={(e) => setExclude(e.target.value)} placeholder="Addresses to leave out" spellCheck={false} />
        </label>
        <label>
          <span className="lbl">Port list</span>
          <select aria-label="Port list" className="field" value={portList} onChange={(e) => setPortList(e.target.value as PortListId)}>
            {Object.keys(PORT_LISTS).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="lbl">Alive test</span>
          <select aria-label="Alive test" className="field" value={alive} onChange={(e) => setAlive(e.target.value as AliveTest)}>
            {Object.keys(ALIVE_TESTS).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="lbl">SSH credential</span>
          <select aria-label="SSH credential" className="field" value={cred} onChange={(e) => setCred(e.target.value)}>
            <option value="">None</option>
            {s.credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button type="submit" className="cbtn cbtn-go">
            Save target
          </button>
          {current ? <span className="small muted">Saved as "{current.name}": {current.hosts}{current.exclude ? `, minus ${current.exclude}` : ''}.</span> : null}
        </div>
      </form>
    </div>
  );
}

function CredentialsPage({ s, onSave }: { s: GvmState; onSave: (c: { id?: string; name: string; login: string; hasKey: boolean }) => void }) {
  const current = s.credentials[0];
  const [name, setName] = useState(current?.name ?? '');
  const [login, setLogin] = useState(current?.login ?? '');
  const [key, setKey] = useState(current?.hasKey ?? false);
  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setLogin(current.login);
    setKey(current.hasKey);
  }, [current]);
  return (
    <div className="gvm-card">
      <p className="small muted" style={{ marginTop: 0 }}>
        A login the scanner uses to look inside each machine. Lantern created a <code>gvm-scan</code> user that may read package lists and nothing else.
      </p>
      <form
        className="gvm-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: current?.id ?? 'cred-1', name, login, hasKey: key });
        }}
      >
        <label>
          <span className="lbl">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="lbl">Type</span>
          <select aria-label="Type" className="field" value="ssh" disabled>
            <option value="ssh">Username + SSH key</option>
          </select>
        </label>
        <label>
          <span className="lbl">Username</span>
          <input className="field mono" value={login} onChange={(e) => setLogin(e.target.value)} spellCheck={false} />
        </label>
        <label className="gvm-check">
          <input type="checkbox" checked={key} onChange={(e) => setKey(e.target.checked)} />
          <span>Paste private key (Lantern's admin hands it over; it is never shown again)</span>
        </label>
        <div className="row">
          <button type="submit" className="cbtn cbtn-go">
            Save credential
          </button>
          {current ? <span className="small muted">Saved: {current.name}, logs in as {current.login}.</span> : null}
        </div>
      </form>
    </div>
  );
}

function TasksPage({ s, onSave, onStart }: { s: GvmState; onSave: (t: { id?: string; name: string; targetId: string; config: ScanConfig; weekly?: boolean }) => void; onStart: (id: string) => void }) {
  const current = s.tasks[0];
  const [name, setName] = useState(current?.name ?? '');
  const [targetId, setTargetId] = useState(current?.targetId ?? s.targets[0]?.id ?? '');
  const [config, setConfig] = useState<ScanConfig>(current?.config ?? 'Discovery');
  const [weekly, setWeekly] = useState(current?.weekly ?? false);
  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setTargetId(current.targetId);
    setConfig(current.config);
    setWeekly(current.weekly);
  }, [current]);
  return (
    <div className="gvm-card">
      {s.tasks.length ? (
        <ul className="gvm-list" data-testid="tasks">
          {s.tasks.map((t) => {
            const n = s.reports.filter((r) => r.taskId === t.id).length;
            return (
              <li key={t.id}>
                <span className="grow">
                  <strong>{t.name}</strong>
                  <span className="small muted">
                    {' '}
                    {t.config} · {s.targets.find((x) => x.id === t.targetId)?.name ?? '?'} · {n} report{n === 1 ? '' : 's'}
                    {t.weekly ? ' · every Monday, 06:00' : ''}
                  </span>
                </span>
                {t.status === 'Running' ? (
                  <span className="gvm-run tnum" data-testid="task-progress">
                    <span className="gvm-bar small"><span style={{ width: `${t.progress}%` }} /></span>
                    {t.progress}%
                  </span>
                ) : (
                  <>
                    <span className="status" data-tone={t.status === 'Done' ? 'good' : undefined} data-testid="task-status">
                      {t.status}
                    </span>
                    <button type="button" className="cbtn cbtn-sm cbtn-go" onClick={() => onStart(t.id)}>
                      Start
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <form
        className="gvm-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ id: current?.id ?? 'task-1', name, targetId, config, weekly });
        }}
      >
        <label>
          <span className="lbl">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span className="lbl">Target</span>
          <select aria-label="Target" className="field" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {s.targets.length ? null : <option value="">No targets yet</option>}
            {s.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="lbl">Scan config</span>
          <select aria-label="Scan config" className="field" value={config} onChange={(e) => setConfig(e.target.value as ScanConfig)}>
            {Object.keys(SCAN_CONFIGS).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <p className="small muted" style={{ margin: 0 }}>{SCAN_CONFIGS[config]}</p>
        <label className="gvm-check">
          <input type="checkbox" checked={weekly} onChange={(e) => setWeekly(e.target.checked)} />
          <span>Schedule: Every Monday, 06:00</span>
        </label>
        <div className="row">
          <button type="submit" className="cbtn cbtn-go">
            Save task
          </button>
        </div>
      </form>
    </div>
  );
}

function ResultsPage({
  s,
  report,
  openKey,
  onOpen,
  onQod,
  onDelta,
  question,
  onAnswer,
  kev,
  onKev,
}: {
  s: GvmState;
  report: Report | undefined;
  openKey: string | null;
  onOpen: (r: Result) => void;
  onQod: (min: number) => void;
  onDelta: () => void;
  question?: string;
  onAnswer: (text: string) => void;
  kev: boolean;
  onKev: () => void;
}) {
  const [qod, setQod] = useState(String(s.minQod));
  const [answer, setAnswer] = useState('');
  useEffect(() => setQod(String(s.minQod)), [s.minQod]);
  if (!report) return <p className="gvm-empty">No reports yet. Run a task first.</p>;
  const rows = visibleResults(s, report);
  const hidden = report.results.filter((r) => r.cvss > 0 && r.qod < s.minQod).length;
  const sameTask = s.reports.filter((r) => r.taskId === report.taskId);
  return (
    <div className="gvm-card">
      <div className="row gvm-filter">
        <span className="grow small">
          Report {report.date} · {report.hostsScanned.length} hosts scanned
        </span>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            onQod(Number(qod) || 0);
          }}
        >
          <label className="small" htmlFor="min-qod">Minimum QoD</label>
          <input id="min-qod" className="field mono gvm-num" inputMode="numeric" value={qod} onChange={(e) => setQod(e.target.value.replace(/[^0-9]/g, ''))} />
          <button type="submit" className="cbtn cbtn-sm">
            Apply
          </button>
        </form>
      </div>
      {hidden ? <p className="small muted" style={{ margin: '0 0 8px' }}>{hidden} result{hidden === 1 ? ' is' : 's are'} hidden by the QoD filter.</p> : null}
      <table className="gvm-table" data-testid="results">
        <thead>
          <tr>
            <th scope="col">Severity</th>
            <th scope="col">Vulnerability</th>
            <th scope="col">Host</th>
            <th scope="col">Port</th>
            <th scope="col">QoD</th>
            {s.kevMatched ? <th scope="col">KEV</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-open={openKey === resultKey(r)} data-key={resultKey(r)} onClick={() => onOpen(r)}>
              <td>
                <SevBadge cvss={effectiveCvss(s, r)} />
              </td>
              <td>
                <button type="button" className="gvm-link" onClick={(e) => { e.stopPropagation(); onOpen(r); }}>
                  {VTS[r.vt]!.name}
                </button>
              </td>
              <td className="mono small">
                {r.host}
                <span className="muted"> {r.hostName.split('.')[0]}</span>
              </td>
              <td className="mono small">{r.port ? `${r.port}/tcp` : 'general'}</td>
              <td className="mono small tnum">{r.qod}%</td>
              {s.kevMatched ? <td>{inKev(r.vt) ? <span className="gvm-kev" data-testid="kev-badge">Exploited</span> : <span className="muted small">no</span>}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="gvm-empty">Nothing to show with this filter.</p> : null}
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {kev ? (
          <button type="button" className="cbtn" onClick={onKev} disabled={s.kevMatched}>
            {s.kevMatched ? 'Matched against KEV' : 'Match against KEV'}
          </button>
        ) : null}
        {sameTask.length >= 2 ? (
          <button type="button" className="cbtn" onClick={onDelta}>
            Compare with last week
          </button>
        ) : null}
      </div>
      {question ? (
        <form
          className="gvm-answer"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(answer);
            setAnswer('');
          }}
        >
          <label className="lbl" htmlFor="gvm-answer">{question}</label>
          <div className="row">
            <input id="gvm-answer" className="field mono grow" value={answer} onChange={(e) => setAnswer(e.target.value)} spellCheck={false} />
            <button type="submit" className="cbtn cbtn-go">
              Check
            </button>
          </div>
          {s.answers.length ? <p className="small muted" style={{ margin: '6px 0 0' }}>Answered: {s.answers.join(', ')}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function KevPage({ onSearch }: { onSearch: (q: string) => void }) {
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const hit = asked ? KEV_BY_CVE[asked.toUpperCase()] : undefined;
  return (
    <div className="gvm-card">
      <p className="small muted" style={{ margin: 0 }}>
        CISA's Known Exploited Vulnerabilities catalog, downloaded as JSON. Every entry is a CVE that attackers have really used.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q);
          setAsked(q.trim());
        }}
      >
        <label className="sr-only" htmlFor="kev-q">Search the KEV catalog</label>
        <input id="kev-q" className="field mono grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="CVE-2021-4034" spellCheck={false} />
        <button type="submit" className="cbtn cbtn-go">
          Search
        </button>
      </form>
      {asked ? (
        hit ? (
          <dl className="gvm-dl gvm-kevcard" data-testid="kev-hit">
            <div><dt>cveID</dt><dd className="mono">{hit.cve}</dd></div>
            <div><dt>vendorProject</dt><dd>{hit.vendor}</dd></div>
            <div><dt>product</dt><dd>{hit.product}</dd></div>
            <div><dt>vulnerabilityName</dt><dd>{hit.name}</dd></div>
            <div><dt>dateAdded</dt><dd className="mono">{hit.dateAdded}</dd></div>
            <div><dt>dueDate</dt><dd className="mono">{hit.dueDate} <span className="small muted">(for US federal agencies)</span></dd></div>
            <div><dt>requiredAction</dt><dd>{hit.requiredAction}</dd></div>
          </dl>
        ) : (
          <p className="gvm-empty" data-testid="kev-none">
            {asked} is not in the catalog. That means nobody has confirmed attacks with it yet, not that it is safe.
          </p>
        )
      ) : null}
    </div>
  );
}

// ---- Details pane ---------------------------------------------------------------------

function ResultDetail({ s, r, note, onOverride }: { s: GvmState; r: Result; note?: string; onOverride: (cvss: number, reason: string) => void }) {
  const v = VTS[r.vt]!;
  const current = s.overrides.find((o) => o.resultKey === resultKey(r));
  const [to, setTo] = useState(current ? String(current.cvss) : 'keep');
  const [reason, setReason] = useState(current?.reason ?? '');
  useEffect(() => {
    setTo(current ? String(current.cvss) : 'keep');
    setReason(current?.reason ?? '');
  }, [r.id, current]);
  return (
    <div className="gvm-detail" data-testid="result-detail">
      <h3>{v.name}</h3>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <SevBadge cvss={effectiveCvss(s, r)} />
        {current ? <span className="small muted">Override: was {r.cvss.toFixed(1)}</span> : null}
      </div>
      <dl className="gvm-dl">
        <div>
          <dt>Host</dt>
          <dd className="mono">
            {r.host} ({r.hostName})
          </dd>
        </div>
        <div>
          <dt>Port</dt>
          <dd className="mono">{r.port ? `${r.port}/tcp` : 'general (the whole host)'}</dd>
        </div>
        {v.cve ? (
          <div>
            <dt>CVE</dt>
            <dd className="mono">{v.cve}</dd>
          </div>
        ) : null}
        <div>
          <dt>QoD</dt>
          <dd>
            <strong className="tnum">{r.qod}%</strong> {QOD_TYPES[v.qodType].text}
          </dd>
        </div>
        <div>
          <dt>Summary</dt>
          <dd>{v.summary}</dd>
        </div>
        <div>
          <dt>Solution</dt>
          <dd>
            <span className="small muted">{v.solutionType}. </span>
            {v.solution}
          </dd>
        </div>
      </dl>
      {note ? <p className="gvm-note" data-testid="result-note">{note}</p> : null}
      {r.cvss > 0 ? (
        <form
          className="gvm-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (to === 'keep') return;
            onOverride(Number(to), reason);
          }}
        >
          <label>
            <span className="lbl">Override</span>
            <select aria-label="Override" className="field" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="keep">Keep as reported</option>
              <option value="-1">False Positive</option>
              <option value="2">Low (2.0)</option>
              <option value="5">Medium (5.0)</option>
            </select>
          </label>
          <label>
            <span className="lbl">Reason</span>
            <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why, and how you know" />
          </label>
          <div className="row">
            <button type="submit" className="cbtn" disabled={to === 'keep'}>
              Save override
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function DeltaView({ a, b }: { a: Report; b: Report }) {
  const d = useMemo(() => delta(a, b), [a, b]);
  const group = (title: string, tone: string, rows: Result[]) => (
    <section className="gvm-delta" data-tone={tone}>
      <h3>
        {title} <span className="muted tnum">{rows.length}</span>
      </h3>
      <ul>
        {rows
          .sort((x, y) => y.cvss - x.cvss)
          .map((r) => (
            <li key={r.id}>
              <SevBadge cvss={r.cvss} />
              <span>
                {VTS[r.vt]!.name}
                <span className="mono small muted">
                  {' '}
                  {r.host} {r.hostName.split('.')[0]}
                </span>
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
  return (
    <div data-testid="delta">
      <p className="small muted" style={{ marginTop: 0 }}>
        Report of {a.date} against {b.date}. Information-only results are left out.
      </p>
      {group('Fixed since last week', 'good', d.fixed)}
      {group('New this week', 'bad', d.added)}
      {group('Still open', 'warn', d.same)}
    </div>
  );
}

function SideHelp({ tab, scope }: { tab: Tab; scope: string }) {
  const text: Record<Tab, string[]> = {
    feed: ['The feed is the list of vulnerability tests (VTs) OpenVAS can run, one small script per flaw or check.', 'It grows every day. If it is old, scans finish without errors and simply miss everything found since.'],
    vts: ['Every test in the feed, searchable by name or CVE number.', 'If a CVE is not here, no scan will find it.'],
    targets: [scope, ...Object.entries(PORT_LISTS).map(([k, v]) => `${k}: ${v.text}`), ...Object.entries(ALIVE_TESTS).map(([k, v]) => `${k}: ${v}`)],
    credentials: ['With a login, OpenVAS reads what is installed on each machine instead of guessing from the outside.', 'Use an account that can read package lists and nothing more.'],
    tasks: ['A task is a target plus a scan config. Each Start makes a new report.', ...Object.entries(SCAN_CONFIGS).map(([k, v]) => `${k}: ${v}`)],
    results: ['Click a result to see what it is, how sure the scanner is (QoD) and the fix.', 'Severity: High from 7.0, Medium from 4.0, Low above 0. QoD under 70% is hidden by default.'],
    kev: ['KEV is a list kept by CISA, the US cyber security agency, of vulnerabilities attackers are known to exploit in the wild.', 'A CVE gets in when there is reliable evidence of real attacks and a clear fix. Scans, research and proof-of-concept code do not count.', 'US federal agencies must fix each entry by its due date. Everyone else is strongly advised to fix KEV entries first.'],
  };
  return (
    <ul className="gvm-help">
      {text[tab].map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}
