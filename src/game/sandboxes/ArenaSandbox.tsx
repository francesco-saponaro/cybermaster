import { useEffect, useRef, useState } from 'react';
import type { ArenaAct, ArenaLevel } from '../../content/types';
import { ARENA_APPS, runApp, testFix, listing, markupInPage, pageText, type FixReport, type Reply, type ArenaApp } from '../../sim/arena';
import { play } from '../../engine/audio';
import { Panes } from '../Panes';
import type { SandboxProps } from '../types';
import { StartHint } from '../StartHint';

interface Run {
  nonce: number;
  against: 'original' | 'fix';
  reply: Reply;
  report?: FixReport;
  normal?: Reply;
}

const WRONG: Record<string, string> = {
  head: 'That line only declares the route. Look further down and click the line number the current step names.',
  pre: 'That line just reads the request. Follow where the value goes next and click the line the current step names.',
  post: 'By this line the damage is already done. Click a line a little higher up, the one the current step names.',
  foot: 'That is the end of the handler. Click the line the current step names, where the input is used.',
  edit: 'Close, but this line is not where the input does its harm. Click the line the current step names.',
};

export function ArenaSandbox({ level, onChecks, fail, act }: SandboxProps<ArenaLevel, ArenaAct>) {
  const app = ARENA_APPS[level.app];
  const [found, setFound] = useState(false);
  const [wrongLine, setWrongLine] = useState<number | null>(null);
  const [code, setCode] = useState(app.code.edit);
  const [report, setReport] = useState<FixReport | null>(null);
  const [runState, setRunState] = useState<Run | null>(null);
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    onChecks({
      found,
      blocked: { pass: !!report && report.attackBlocked && report.variantsBlocked, detail: report && !(report.attackBlocked && report.variantsBlocked) ? report.reason : undefined },
      works: { pass: !!report && report.normalWorks && !report.error, detail: report && !report.normalWorks && report.attackBlocked && report.variantsBlocked ? report.reason : undefined },
    });
  }, [found, report, onChecks]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const animate = (r: Run) => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setRunState(r);
    setStep(0);
    for (let i = 1; i <= 4; i++) {
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          play(i === 3 ? (r.reply.harmed ? 'miss' : 'hit') : 'tick');
        }, i * 650),
      );
    }
    setFocus({ id: 'app', nonce: r.nonce });
  };

  const replayOriginal = () => {
    play('blip');
    animate({ nonce: Date.now(), against: 'original', reply: runApp(level.app, app.code.edit, app.attack) });
  };

  const replayAgainstFix = (edit: string) => {
    play('blip');
    const rep = testFix(level.app, edit);
    setReport(rep);
    const reply = runApp(level.app, edit, app.attack);
    const normal = runApp(level.app, edit, app.normal[0]!);
    animate({ nonce: Date.now(), against: 'fix', reply, report: rep, normal });
    if (rep.reason) fail(rep.reason);
  };

  const pick = (lineNo: number, region: string) => {
    if (found) return;
    const { fault } = listing(app, code);
    if (lineNo === fault) {
      setFound(true);
      setWrongLine(null);
      play('hit');
    } else {
      setWrongLine(lineNo);
      fail(WRONG[region] ?? WRONG.edit!);
    }
  };

  useEffect(() => {
    if (!act) return;
    const a = act.act;
    if (a.replay && !found && !a.pick) replayOriginal();
    if (a.replay && a.pick) replayOriginal();
    if (a.pick) setFound(true);
    if (a.code === 'fix') {
      setFound(true);
      setCode(app.code.fix);
      setFocus({ id: 'code', nonce: Date.now() });
    }
    if (a.replay && found && !a.pick) replayAgainstFix(a.code === 'fix' ? app.code.fix : code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const view = listing(app, code);

  const appPane = (
    <div className="mb">
      <div className="mb-bar">
        <div className="mb-url">
          <span className="host">{level.url}</span>
        </div>
      </div>
      <div className="mb-page" style={{ fontFamily: 'var(--font-display)' }}>
        <p style={{ fontSize: '0.8125rem', color: '#5b564c', margin: '0 0 6px' }}>{level.appName}</p>
        <AppIdle app={app} />
      </div>
      <Replay app={app} run={runState} step={step} onPlay={replayOriginal} />
    </div>
  );

  const codePane = (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {!found ? <StartHint text="Click the line of code the first step names." /> : null}
      <ol className="codelist" aria-label="Server code">
        {view.lines.map((l, i) => {
          const no = i + 1;
          if (found && l.region === 'edit') {
            if (view.lines.findIndex((x) => x.region === 'edit') !== i) return null;
            return (
              <li key="edit" className="code-edit-wrap">
                <div className="code-edit">
                  <textarea
                    aria-label="Your fix (editable)"
                    value={code}
                    rows={Math.max(3, code.split('\n').length + 1)}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
              </li>
            );
          }
          const isFault = found && no === view.fault;
          return (
            <li key={i}>
              <button
                type="button"
                className="codeline"
                data-region={l.region}
                data-state={isFault ? 'fault' : wrongLine === no ? 'wrong' : undefined}
                disabled={found}
                onClick={() => pick(no, l.region)}
                aria-label={`Line ${no}: ${l.text.trim()}`}
              >
                <span className="ln">{no}</span>
                <span className="tx">{l.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="pane-pad small muted" style={{ marginTop: 'auto', borderTop: '1px solid var(--line)' }}>
        {found ? 'The red box is yours to rewrite. Replay attack runs the recorded attack, its variants and a normal visitor against it.' : 'Click the line where the input does its damage.'}
      </div>
    </div>
  );

  return (
    <Panes
      focus={focus}
      hint="code"
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)' }}
      panes={[
        { id: 'app', label: 'App and replay', body: appPane, dot: !!runState },
        {
          id: 'code',
          label: 'Server code',
          head: (
            <>
              <h2>Server code</h2>
              <span className="spacer" />
              {found ? (
                <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={() => replayAgainstFix(code)}>
                  Replay attack
                </button>
              ) : (
                <span className="small muted">Find the faulty line</span>
              )}
            </>
          ),
          body: codePane,
        },
      ]}
    />
  );
}

/** What the app looks like to a normal visitor, before anything happens. */
function AppIdle({ app }: { app: ArenaApp }) {
  switch (app.id) {
    case 'login':
      return (
        <div aria-hidden="true">
          <h3>Staff sign-in</h3>
          <label>Name</label>
          <div className="fakefield" />
          <label>Password</label>
          <div className="fakefield" />
        </div>
      );
    case 'search':
      return (
        <div aria-hidden="true">
          <h3>Search the shop</h3>
          <div className="fakefield" />
        </div>
      );
    case 'invoices':
      return <h3>GET /api/invoices/:id</h3>;
    case 'ping':
      return (
        <div aria-hidden="true">
          <h3>Network check</h3>
          <label>Host to ping</label>
          <div className="fakefield" />
        </div>
      );
    case 'preview':
      return (
        <div aria-hidden="true">
          <h3>Paste a link, get a preview card</h3>
          <div className="fakefield" />
        </div>
      );
    case 'signup':
      return (
        <div aria-hidden="true">
          <h3>Create an account</h3>
          <label>Name</label>
          <div className="fakefield" />
          <label>Email</label>
          <div className="fakefield" />
        </div>
      );
  }
}

function outcomeText(app: ArenaApp, reply: Reply): string {
  const b = reply.body;
  if (app.id === 'search' && typeof b === 'string') return markupInPage(b) ? 'The page now contains the attacker\'s markup.' : pageText(b);
  if (typeof b === 'string') return `${reply.status}: ${b.split('\n').filter(Boolean).slice(-1)[0] ?? ''}`;
  if (b && typeof b === 'object') return `${reply.status}: ${JSON.stringify(b)}`;
  return String(reply.status);
}

function Replay({ app, run, step, onPlay }: { app: ArenaApp; run: Run | null; step: number; onPlay: () => void }) {
  const original = !run || run.against === 'original';
  const lines = run
    ? original
      ? app.replay
      : [
          app.replay[0]!,
          { who: 'Server' as const, text: run.reply.log.length ? run.reply.log[run.reply.log.length - 1]! : 'Handles the request with your code.' },
          { who: 'Result' as const, text: run.reply.harmed ? `It worked again. ${app.replay[2]!.text}` : app.blockedText },
        ]
    : [];
  const normalOk = run?.report?.normalWorks;
  return (
    <section className="replay" aria-label="Incident replay" aria-live="polite">
      <div className="row">
        <h2 className="grow" style={{ fontSize: '0.875rem' }}>{run && !original ? 'Replay against your fix' : 'Incident replay'}</h2>
        <button type="button" className="cbtn cbtn-sm" onClick={onPlay}>
          {run ? 'Play the incident again' : 'Play the recorded attack'}
        </button>
      </div>
      {!run ? <p className="small muted" style={{ margin: '8px 0 0' }}>A real attack was recorded against this app. Play it to see what happened.</p> : null}
      <ol className="replay-steps">
        {lines.map((l, i) =>
          i < step ? (
            <li key={`${run!.nonce}-${i}`} className="slide-in" data-who={l.who} data-harm={l.who === 'Result' ? String(!!run!.reply.harmed) : undefined}>
              <span className="who">{l.who}</span>
              <span>{l.text}</span>
            </li>
          ) : null,
        )}
        {run && !original && step >= 4 ? (
          <li className="slide-in" data-who="Result" data-harm={String(!normalOk)}>
            <span className="who">Normal use</span>
            <span>{normalOk ? app.normalText : `Broken: ${run.report?.reason ?? 'a normal visitor no longer gets what they came for.'}`}</span>
          </li>
        ) : null}
      </ol>
      {run && original && step >= 3 ? (
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          What the server sent back: {outcomeText(app, run.reply)}
        </p>
      ) : null}
    </section>
  );
}
