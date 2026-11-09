import { useEffect, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { LevelCheck } from '../content/types';
import type { CheckState } from './types';
import { Rich } from './Rich';

const Tick = () => (
  <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.5l2.5 2.5L10 3.5" stroke="#06140b" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The step to work on: the first one that is not green yet. */
export function currentStep(steps: LevelCheck[], checks: Record<string, CheckState>): number {
  return steps.findIndex((c) => !checks[c.id]?.pass);
}

function StepDo({ step, detail }: { step: LevelCheck; detail?: string }) {
  return (
    <div className="step-do slide-in">
      <p>
        <Rich text={step.do} />
      </p>
      {step.hint ? (
        <>
          <p className="step-hint-label">It should look like this:</p>
          <pre className="step-hint" data-testid="step-hint">
            {step.hint}
          </pre>
        </>
      ) : null}
      {detail ? <p className="step-status">{detail}</p> : null}
    </div>
  );
}

/**
 * The level's checks as numbered steps. The current step is open and says
 * exactly what to do; done steps show a tick and the one line they taught;
 * later steps show their label and open on a tap.
 */
export function StepList({ steps, checks, together, currentRef }: { steps: LevelCheck[]; checks: Record<string, CheckState>; together?: boolean; currentRef?: Ref<HTMLLIElement> }) {
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [fresh, setFresh] = useState<string | null>(null);
  const prev = useRef<Record<string, boolean> | null>(null);

  // Highlight the line a step teaches for a few seconds after it turns green.
  useEffect(() => {
    if (Object.keys(checks).length === 0) {
      prev.current = null;
      return undefined;
    }
    const now = Object.fromEntries(steps.map((c) => [c.id, !!checks[c.id]?.pass]));
    const before = prev.current;
    prev.current = now;
    if (!before) return undefined;
    const newly = steps.find((c) => now[c.id] && !before[c.id]);
    if (!newly) return undefined;
    setFresh(newly.id);
    const t = window.setTimeout(() => setFresh(null), 6000);
    return () => window.clearTimeout(t);
  }, [checks, steps]);

  const cur = currentStep(steps, checks);
  return (
    <ol className="steps" aria-label="Steps">
      {steps.map((c, i) => {
        const pass = !!checks[c.id]?.pass;
        const isCurrent = i === cur;
        const showDo = pass ? !!opened[c.id] : together || isCurrent || !!opened[c.id];
        const state = pass ? 'done' : isCurrent ? 'current' : 'todo';
        return (
          <li key={c.id} className="step" data-state={state} data-pass={pass} data-check={c.id} ref={isCurrent ? currentRef : undefined}>
            <button
              type="button"
              className="step-head"
              aria-expanded={showDo}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => setOpened((o) => ({ ...o, [c.id]: !showDo }))}
            >
              <span className="step-mark" aria-hidden="true">
                {pass ? <Tick /> : i + 1}
              </span>
              <span className="step-label">
                <span className="sr-only">{pass ? 'Done: ' : isCurrent ? 'Now: ' : 'Later: '}</span>
                {c.label}
              </span>
            </button>
            {pass ? (
              <p className="step-learned" data-fresh={fresh === c.id}>
                <Rich text={c.learned} />
              </p>
            ) : null}
            {showDo ? <StepDo step={c} detail={pass ? undefined : checks[c.id]?.detail} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * On a phone the step list sits above the sandbox. Once it scrolls out of
 * view, this bar stays at the top of the screen with the current step; a tap
 * opens what to do.
 */
export function StepBar({ steps, checks, visible, failure }: { steps: LevelCheck[]; checks: Record<string, CheckState>; visible: boolean; failure?: { text: string; nonce: number } | null }) {
  const [open, setOpen] = useState(false);
  const [failShown, setFailShown] = useState<number | null>(null);
  // A failed attempt shows here too for a while, since the full message sits
  // up in the step column, out of sight while you work in the sandbox.
  useEffect(() => {
    if (!failure) {
      setFailShown(null);
      return undefined;
    }
    setFailShown(failure.nonce);
    const t = window.setTimeout(() => setFailShown(null), 9000);
    return () => window.clearTimeout(t);
  }, [failure]);
  const cur = currentStep(steps, checks);
  const step = cur >= 0 ? steps[cur] : null;
  return (
    <div className="stepbar" data-visible={visible} aria-hidden={!visible}>
      <button type="button" className="stepbar-head" aria-expanded={open} onClick={() => setOpen((o) => !o)} tabIndex={visible ? 0 : -1}>
        <span className="stepbar-n">{step ? `Step ${cur + 1} of ${steps.length}` : 'All steps done'}</span>
        <span className="stepbar-label">{step?.label ?? ''}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="stepbar-chev">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {failure && failShown === failure.nonce ? (
        <p key={failure.nonce} className="stepbar-fail" role="status">
          <strong>Not yet.</strong> {failure.text}
        </p>
      ) : null}
      {open && step ? <StepDo step={step} detail={checks[step.id]?.detail} /> : null}
    </div>
  );
}
