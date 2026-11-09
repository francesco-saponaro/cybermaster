import { describe, it, expect } from 'vitest';
import { ALL_LEVELS } from '../src/content/index';

// Once a player passes a check, the panel shows what to do for the next one.
// Every check after the first needs that line, so nobody is left on a
// half-green level with no idea what comes next. The finding level is the
// exception: the client's comments on each field do that job.
describe('next steps', () => {
  it('every check after the first says what to do', () => {
    const missing = ALL_LEVELS.filter((l) => l.id !== 'report-finding').flatMap((l) =>
      l.checks.slice(1).filter((c) => !c.next).map((c) => `${l.id}:${c.id}`),
    );
    expect(missing).toEqual([]);
  });
});
