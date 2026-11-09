import type { TerminalLevel } from '../content/types';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function factMatches(pattern: string, facts: string[]): boolean {
  if (pattern.endsWith('*')) return facts.some((f) => f.startsWith(pattern.slice(0, -1)));
  return facts.includes(pattern);
}

/** Is a submitted answer right for this level, and if not, what to say. */
export function judgeAnswer(level: TerminalLevel, answer: string): { correct: boolean; reason: string } {
  const a = norm(answer);
  const right = level.goals.some((g) => g.answers?.some((x) => norm(x) === a));
  if (right) return { correct: true, reason: '' };
  const w = level.wrong.find((x) => x.answers.some((y) => norm(y) === a));
  return { correct: false, reason: w ? w.reason : level.otherwise };
}

/** Each goal of a terminal level: passed when a fact was seen or a right answer was submitted. */
export function evaluateTerminal(level: TerminalLevel, facts: string[], submitted: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const g of level.goals) {
    const byFact = g.facts ? g.facts.some((p) => factMatches(p, facts)) : false;
    const byAnswer = g.answers ? submitted.some((s) => g.answers!.some((x) => norm(x) === norm(s))) : false;
    out[g.id] = byFact || byAnswer;
  }
  return out;
}
