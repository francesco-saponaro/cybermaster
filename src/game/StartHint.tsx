import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ZoneId } from '../content/types';

// The first level of each zone points once at the sandbox control you start
// with. Dismissing it (or doing the first step) hides it for good in this
// browser. Storage can be missing or blocked, so every access is guarded.

const key = (zone: ZoneId) => `cybermaster.hint.${zone}`;

function seen(zone: ZoneId): boolean {
  try {
    return localStorage.getItem(key(zone)) === '1';
  } catch {
    return false;
  }
}

function remember(zone: ZoneId) {
  try {
    localStorage.setItem(key(zone), '1');
  } catch {
    // Nothing to do: the hint simply shows again next time.
  }
}

export interface StartHintState {
  show: boolean;
  dismiss: () => void;
}

export const StartHintContext = createContext<StartHintState>({ show: false, dismiss: () => {} });

export function useStartHintState(zone: ZoneId, firstLevel: boolean): StartHintState {
  const [show, setShow] = useState(() => firstLevel && !seen(zone));
  const dismiss = useCallback(() => {
    setShow(false);
    remember(zone);
  }, [zone]);
  return useMemo(() => ({ show, dismiss }), [show, dismiss]);
}

export const useStartHint = () => useContext(StartHintContext);

/**
 * A small "start here" note placed in the layout right next to the control it
 * points at, so it pushes content aside instead of covering it.
 */
export function StartHint({ text, arrow = 'down', align = 'start' }: { text: string; arrow?: 'up' | 'down'; align?: 'start' | 'end' }) {
  const { show, dismiss } = useStartHint();
  if (!show) return null;
  return (
    <aside className="start-hint slide-in" role="note" data-arrow={arrow} data-align={align} aria-label="Where to start">
      <svg className="start-hint-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {arrow === 'up' ? (
          <path d="M12 20V5M5 11l7-7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 4v15M5 13l7 7 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <span className="start-hint-text">
        <strong>Start here.</strong> {text}
      </span>
      <button type="button" className="start-hint-x" onClick={dismiss}>
        Got it
      </button>
    </aside>
  );
}
