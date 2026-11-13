import { useEffect, useRef } from 'react';

/** True on a phone or tablet: a finger, not a mouse. */
export function coarsePointer(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * On touch screens, the commands and filters printed in the steps can be
 * tapped to fill the sandbox's input, so nobody has to type a long command on
 * a phone keyboard. Nothing runs by itself: the player still presses Run or
 * Apply. `accept` decides which printed codes are fillable; those get
 * data-fill="1" so the stylesheet can mark them.
 */
export function useStepChips(accept: (code: string) => boolean, onPick: (code: string) => void): void {
  const pick = useRef(onPick);
  const ok = useRef(accept);
  pick.current = onPick;
  ok.current = accept;
  useEffect(() => {
    if (!coarsePointer()) return;
    let frame = 0;
    const mark = () => {
      frame = 0;
      for (const el of document.querySelectorAll<HTMLElement>('.step-do code.kbd, .stepbar code.kbd')) {
        const fill = ok.current(el.textContent ?? '');
        if (fill) {
          el.dataset.fill = '1';
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `Use ${el.textContent}`);
        } else delete el.dataset.fill;
      }
    };
    mark();
    const obs = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(mark);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('code.kbd[data-fill="1"]');
      if (!el) return;
      e.preventDefault();
      pick.current(el.textContent ?? '');
    };
    document.addEventListener('click', onClick);
    return () => {
      obs.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('click', onClick);
    };
  }, []);
}
