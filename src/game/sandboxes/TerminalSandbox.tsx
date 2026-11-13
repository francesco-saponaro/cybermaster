import { useEffect, useRef, useState } from 'react';
import type { TerminalAct, TerminalLevel } from '../../content/types';
import { execute, complete, MAN, boxNow, BOX_COMMANDS, COMMANDS } from '../../sim/terminal';
import { evaluateTerminal, judgeAnswer } from '../evaluate';
import { play } from '../../engine/audio';
import { Panes } from '../Panes';
import type { SandboxProps } from '../types';
import { StartHint } from '../StartHint';
import { useStepChips, coarsePointer } from '../useStepChips';

interface Line {
  id: number;
  text: string;
  kind: 'cmd' | 'out' | 'ok' | 'err' | 'dim';
  /** The prompt a command was typed at. */
  prompt?: string;
}

const PROMPT = 'analyst@watch:~$';

/** The prompt for where you are: user, machine and folder, as bash prints it. */
function promptFor(level: TerminalLevel, history: string[]): string {
  const box = boxNow({ net: level.network, history: [...history, ''] });
  if (!box) return PROMPT;
  const dir = box.cwd === box.home ? '~' : box.cwd.startsWith(box.home + '/') ? '~' + box.cwd.slice(box.home.length) : box.cwd;
  return `${box.user}@${box.hostname}:${dir}$`;
}

export function TerminalSandbox({ level, onChecks, fail, act }: SandboxProps<TerminalLevel, TerminalAct>) {
  const [lines, setLines] = useState<Line[]>(() => [
    {
      id: 0,
      text: level.network.box
        ? `Logged in to ${level.network.box.hostname} as ${level.network.box.user}. Type help for commands, man <command> for a manual.`
        : `Connected to the ${level.network.cidr} engagement. Type help for commands, man <command> for a manual.`,
      kind: 'dim',
    },
  ]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState<number | null>(null);
  const [facts, setFacts] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [man, setMan] = useState<string>(level.manual ?? 'nmap');
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const nextId = useRef(1);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChecks(evaluateTerminal(level, facts, submitted));
  }, [facts, submitted, level, onChecks]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  const push = (items: Omit<Line, 'id'>[]) => setLines((ls) => [...ls, ...items.map((l) => ({ ...l, id: nextId.current++ }))]);

  const runLine = (raw: string) => {
    const line = raw.trim();
    if (busy) return;
    push([{ text: line, kind: 'cmd', prompt: promptFor(level, history) }]);
    setInput('');
    setHIndex(null);
    if (!line) return;
    const nextHistory = [...history, line];
    setHistory(nextHistory);
    play('tick');
    const r = execute(line, { net: level.network, history: nextHistory });
    if (r.clear) {
      setLines([]);
      return;
    }
    if (r.man) {
      setMan(r.man);
      setFocus({ id: 'manual', nonce: Date.now() });
    }
    const finish = () => {
      push(r.out.map((t) => ({ text: t, kind: r.fail ? 'err' : 'out' })));
      if (r.facts.length) setFacts((f) => [...new Set([...f, ...r.facts])]);
      if (r.fail) fail(r.fail);
      if (r.submit !== undefined) {
        const verdict = judgeAnswer(level, r.submit);
        if (verdict.correct) {
          push([{ text: 'Accepted. The lead has it.', kind: 'ok' }]);
          setSubmitted((s) => [...s, r.submit!]);
        } else {
          push([{ text: `Rejected: ${verdict.reason}`, kind: 'err' }]);
          fail(verdict.reason);
        }
      }
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    };
    if (r.delay) {
      setBusy(true);
      push([{ text: 'Scanning...', kind: 'dim' }]);
      window.setTimeout(finish, r.delay);
    } else finish();
  };

  // On a phone, tapping a command in the steps puts it at the prompt.
  useStepChips(
    (code) => {
      const first = code.trim().split(/\s+/)[0] ?? '';
      return (COMMANDS.includes(first) || BOX_COMMANDS.includes(first)) && first !== 'man' && !(first === 'submit' && code.trim() === 'submit');
    },
    (code) => {
      setInput(code.trim());
      setFocus({ id: 'terminal', nonce: Date.now() });
      requestAnimationFrame(() => inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    },
  );

  const doComplete = () => {
    const c = complete(input, { net: level.network, history });
    setInput(c.line);
    if (c.options.length) push([{ text: `${promptFor(level, history)} ${input}`, kind: 'dim' }, { text: c.options.join('   '), kind: 'dim' }]);
  };

  const recall = (dir: -1 | 1) => {
    if (!history.length) return;
    const i = hIndex === null ? (dir === -1 ? history.length - 1 : null) : Math.min(history.length - 1, Math.max(0, hIndex + dir));
    if (i === null) return;
    if (dir === 1 && hIndex === history.length - 1) {
      setHIndex(null);
      setInput('');
      return;
    }
    setHIndex(i);
    setInput(history[i] ?? '');
  };

  useEffect(() => {
    if (!act) return;
    if (act.act.run) runLine(act.act.type);
    else {
      setInput(act.act.type);
      inputRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const page = MAN[man];

  const terminal = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} onClick={() => inputRef.current?.focus({ preventScroll: true })}>
      <div className="term" ref={scroller} role="log" aria-label="Terminal output">
        {lines.map((l) =>
          l.kind === 'cmd' ? (
            <div key={l.id} className="term-line cmd new">
              <span className="prompt">{l.prompt ?? PROMPT}</span> {l.text}
            </div>
          ) : (
            <div key={l.id} className={`term-line new ${l.kind}`}>
              {l.text}
            </div>
          ),
        )}
      </div>
      <StartHint text={coarsePointer() ? 'Tap a command in the steps to put it here, then press Run.' : 'Click this prompt, type the command from the step and press Enter.'} />
      <form
        className="term-input"
        onSubmit={(e) => {
          e.preventDefault();
          runLine(input);
        }}
      >
        <span className="prompt">{promptFor(level, history)}</span>
        <input
          ref={inputRef}
          aria-label="Command"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              doComplete();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              recall(-1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              recall(1);
            } else if (e.key === 'l' && e.ctrlKey) {
              e.preventDefault();
              setLines([]);
            }
          }}
        />
      </form>
      <div className="term-keys">
        <button type="button" className="cbtn cbtn-sm" onClick={doComplete}>Tab</button>
        <button type="button" className="cbtn cbtn-sm" onClick={() => recall(-1)} aria-label="Previous command">Up</button>
        <button type="button" className="cbtn cbtn-sm" onClick={() => recall(1)} aria-label="Next command">Down</button>
        <span className="grow" />
        <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={() => runLine(input)}>Run</button>
      </div>
    </div>
  );

  const manual = (
    <div className="pane-pad man">
      <div className="wrap-row" style={{ marginBottom: 12 }}>
        {Object.keys(MAN).filter((k) => level.network.box || !BOX_COMMANDS.includes(k)).map((k) => (
          <button key={k} type="button" className="tab" aria-selected={k === man} style={{ padding: '6px 8px' }} onClick={() => setMan(k)}>
            {k}
          </button>
        ))}
      </div>
      {page ? (
        <>
          <h3>{man}</h3>
          <p className="syn">{page.synopsis}</p>
          {page.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </>
      ) : null}
    </div>
  );

  return (
    <Panes
      focus={focus}
      hint="terminal"
      grid={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)' }}
      panes={[
        { id: 'terminal', label: 'Terminal', body: terminal, bodyClass: 'term-body' },
        { id: 'manual', label: 'Manual', head: <h2>Manual</h2>, body: manual },
      ]}
    />
  );
}
