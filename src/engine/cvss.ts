// CVSS v3.1 base score, as specified by FIRST (https://www.first.org/cvss/v3.1/specification-document).

export const METRICS = ['AV', 'AC', 'PR', 'UI', 'S', 'C', 'I', 'A'] as const;
export type MetricName = (typeof METRICS)[number];

export const METRIC_VALUES: Record<MetricName, readonly string[]> = {
  AV: ['N', 'A', 'L', 'P'],
  AC: ['L', 'H'],
  PR: ['N', 'L', 'H'],
  UI: ['N', 'R'],
  S: ['U', 'C'],
  C: ['N', 'L', 'H'],
  I: ['N', 'L', 'H'],
  A: ['N', 'L', 'H'],
};

export const METRIC_LABELS: Record<MetricName, { name: string; values: Record<string, string> }> = {
  AV: { name: 'Attack vector', values: { N: 'Network', A: 'Adjacent', L: 'Local', P: 'Physical' } },
  AC: { name: 'Attack complexity', values: { L: 'Low', H: 'High' } },
  PR: { name: 'Privileges required', values: { N: 'None', L: 'Low', H: 'High' } },
  UI: { name: 'User interaction', values: { N: 'None', R: 'Required' } },
  S: { name: 'Scope', values: { U: 'Unchanged', C: 'Changed' } },
  C: { name: 'Confidentiality', values: { N: 'None', L: 'Low', H: 'High' } },
  I: { name: 'Integrity', values: { N: 'None', L: 'Low', H: 'High' } },
  A: { name: 'Availability', values: { N: 'None', L: 'Low', H: 'High' } },
};

export type Vector = Record<MetricName, string>;

const AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const AC: Record<string, number> = { L: 0.77, H: 0.44 };
const PR_U: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PR_C: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const UI: Record<string, number> = { N: 0.85, R: 0.62 };
const CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

/** The 3.1 round-up: smallest number to one decimal place at or above the input. */
export function roundUp(x: number): number {
  const int = Math.round(x * 100000);
  if (int % 10000 === 0) return int / 100000;
  return (Math.floor(int / 10000) + 1) / 10;
}

export function parseVector(text: string): Vector {
  const out: Partial<Vector> = {};
  for (const part of text.replace(/^CVSS:3\.[01]\//, '').split('/')) {
    const [k, v] = part.split(':');
    if (k && v && (METRICS as readonly string[]).includes(k) && METRIC_VALUES[k as MetricName].includes(v)) {
      out[k as MetricName] = v;
    }
  }
  for (const m of METRICS) if (!out[m]) throw new Error(`Vector is missing ${m}: ${text}`);
  return out as Vector;
}

export function formatVector(v: Vector): string {
  return 'CVSS:3.1/' + METRICS.map((m) => `${m}:${v[m]}`).join('/');
}

export function baseScore(v: Vector): number {
  const changed = v.S === 'C';
  const iss = 1 - (1 - CIA[v.C]!) * (1 - CIA[v.I]!) * (1 - CIA[v.A]!);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15) : 6.42 * iss;
  const pr = (changed ? PR_C : PR_U)[v.PR]!;
  const exploitability = 8.22 * AV[v.AV]! * AC[v.AC]! * pr * UI[v.UI]!;
  if (impact <= 0) return 0;
  if (changed) return roundUp(Math.min(1.08 * (impact + exploitability), 10));
  return roundUp(Math.min(impact + exploitability, 10));
}

export function severity(score: number): 'None' | 'Low' | 'Medium' | 'High' | 'Critical' {
  if (score === 0) return 'None';
  if (score < 4) return 'Low';
  if (score < 7) return 'Medium';
  if (score < 9) return 'High';
  return 'Critical';
}

/** How close a guess is to the target: metrics right out of eight, and the score gap. */
export function compareVectors(guess: Vector, target: Vector): { matched: number; scoreGap: number } {
  const matched = METRICS.filter((m) => guess[m] === target[m]).length;
  const scoreGap = Math.abs(baseScore(guess) - baseScore(target));
  return { matched, scoreGap };
}
