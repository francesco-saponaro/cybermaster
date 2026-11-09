import { useStore } from '../state/store';
import { PROLOGUE } from '../content/briefings';
import { Briefing } from './Briefing';

// The 60-second interactive prologue, shown once the first time the game opens.
// It sits over everything until the player finishes or skips it.
export function Prologue() {
  const { save, finishPrologue } = useStore();
  // A deep link past the intro (used when embedding a single screen).
  let skip = false;
  try {
    skip = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nointro');
  } catch {
    skip = false;
  }
  if (save.prologueDone || skip) return null;

  return (
    <div
      role="dialog"
      aria-label="Welcome to the Watch"
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)', overflowY: 'auto' }}
    >
      <div className="wrap" style={{ paddingBlock: 'clamp(28px,6vw,64px)' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={finishPrologue}>
            Skip the intro
          </button>
        </div>
        <Briefing briefing={PROLOGUE} mentor={PROLOGUE.mentor} onDone={finishPrologue} />
      </div>
    </div>
  );
}
