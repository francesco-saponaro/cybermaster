// A tiny SQL engine for the login levels: one table, one SELECT, a WHERE with
// AND, OR, NOT, comparisons and parentheses, MySQL-style comments. Enough for
// an injected quote to break the query or a tautology to return every row,
// exactly as a real database would, and nothing else.

export type Row = Record<string, string | number>;

export interface SqlResult {
  ok: boolean;
  rows: Row[];
  error?: string;
  /** The statement as the database received it, after any parameters were bound. */
  sql: string;
}

type T = { k: 'str'; v: string } | { k: 'num'; v: number } | { k: 'id'; v: string } | { k: 'op'; v: string } | { k: 'ph'; v: string } | { k: 'eof' };

function sqlError(near: string): string {
  return `You have an error in your SQL syntax near '${near.slice(0, 24)}'`;
}

function lex(sql: string): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if ((c === '-' && sql[i + 1] === '-') || c === '#') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new Error(sqlError(sql.slice(i)));
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const start = i;
      i++;
      let s = '';
      for (;;) {
        if (i >= sql.length) throw new Error(sqlError(sql.slice(start)));
        if (sql[i] === c && sql[i + 1] === c) {
          s += c;
          i += 2;
        } else if (sql[i] === c) {
          i++;
          break;
        } else if (sql[i] === '\\') {
          s += sql[i + 1] ?? '';
          i += 2;
        } else s += sql[i++];
      }
      out.push({ k: 'str', v: s });
      continue;
    }
    if (/\d/.test(c)) {
      const start = i;
      while (i < sql.length && /[\d.]/.test(sql[i]!)) i++;
      out.push({ k: 'num', v: Number(sql.slice(start, i)) });
      continue;
    }
    if (c === '?') {
      out.push({ k: 'ph', v: '?' });
      i++;
      continue;
    }
    if ((c === '$' || c === ':') && /[\w]/.test(sql[i + 1] ?? '')) {
      const start = i;
      i++;
      while (i < sql.length && /\w/.test(sql[i]!)) i++;
      out.push({ k: 'ph', v: sql.slice(start, i) });
      continue;
    }
    if (/[A-Za-z_`]/.test(c)) {
      const start = i;
      while (i < sql.length && /[\w`.]/.test(sql[i]!)) i++;
      out.push({ k: 'id', v: sql.slice(start, i).replace(/`/g, '') });
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (['<>', '!=', '<=', '>=', '||', '&&'].includes(two)) {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if ('=<>(),*;'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(sqlError(sql.slice(i)));
  }
  out.push({ k: 'eof' });
  return out;
}

/** Escape a bound value the way a driver would before sending it. */
function literal(v: unknown): string {
  if (typeof v === 'number') return String(v);
  return "'" + String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

/**
 * Bind parameters into a statement: `?` takes values in order, `$1` by index,
 * `:name` by key. Values go in as escaped literals, so they can never become SQL.
 */
export function bind(sql: string, params: unknown): { sql: string; error?: string } {
  const toks = lexPlaceholders(sql);
  if (toks.count === 0) return { sql };
  if (params === undefined || params === null) return { sql, error: 'The query has placeholders but no values were passed for them.' };
  let n = 0;
  let error: string | undefined;
  const out = sql.replace(/('(?:[^']|'')*')|("(?:[^"]|"")*")|\?|\$(\d+)|:(\w+)/g, (m, sq, dq, idx, name) => {
    if (sq || dq) return m;
    if (m === '?') {
      if (!Array.isArray(params)) {
        error = 'Use a list of values with ? placeholders.';
        return m;
      }
      if (n >= params.length) error = 'There are more ? placeholders than values.';
      return literal(params[n++]);
    }
    if (idx) {
      if (!Array.isArray(params)) {
        error = 'Use a list of values with $1, $2 placeholders.';
        return m;
      }
      const i = Number(idx) - 1;
      if (i < 0 || i >= params.length) error = `There is no value for $${idx}.`;
      return literal(params[i]);
    }
    if (name) {
      if (Array.isArray(params) || typeof params !== 'object') {
        error = `Use an object like { ${name}: ... } with :${name} placeholders.`;
        return m;
      }
      const obj = params as Record<string, unknown>;
      if (!(name in obj)) error = `There is no value for :${name}.`;
      return literal(obj[name]);
    }
    return m;
  });
  return { sql: out, error };
}

function lexPlaceholders(sql: string): { count: number } {
  const stripped = sql.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, '');
  return { count: (stripped.match(/\?|\$\d+|:\w+/g) ?? []).length };
}

class Q {
  private i = 0;
  private toks: T[];
  constructor(toks: T[]) {
    this.toks = toks;
  }
  peek(): T {
    return this.toks[this.i]!;
  }
  next(): T {
    return this.toks[this.i++]!;
  }
  kw(v: string): boolean {
    const t = this.peek();
    return t.k === 'id' && t.v.toUpperCase() === v;
  }
  op(v: string): boolean {
    const t = this.peek();
    return t.k === 'op' && t.v === v;
  }
  near(): string {
    const t = this.peek();
    if (t.k === 'eof') return '';
    if (t.k === 'str') return `'${t.v}'`;
    return String(t.v);
  }
}

type Cond = (row: Row) => unknown;

function parseOr(q: Q): Cond {
  let left = parseAnd(q);
  while (q.kw('OR') || q.op('||')) {
    q.next();
    const l = left;
    const r = parseAnd(q);
    left = (row) => truth(l(row)) || truth(r(row));
  }
  return left;
}

function parseAnd(q: Q): Cond {
  let left = parseNot(q);
  while (q.kw('AND') || q.op('&&')) {
    q.next();
    const l = left;
    const r = parseNot(q);
    left = (row) => truth(l(row)) && truth(r(row));
  }
  return left;
}

function parseNot(q: Q): Cond {
  if (q.kw('NOT')) {
    q.next();
    const e = parseNot(q);
    return (row) => !truth(e(row));
  }
  return parseCmp(q);
}

function parseCmp(q: Q): Cond {
  const left = parseTerm(q);
  const t = q.peek();
  if (t.k === 'op' && ['=', '<>', '!=', '<', '>', '<=', '>='].includes(t.v)) {
    q.next();
    const right = parseTerm(q);
    return (row) => compare(t.v, left(row), right(row));
  }
  if (q.kw('LIKE')) {
    q.next();
    const right = parseTerm(q);
    return (row) => like(String(left(row)), String(right(row)));
  }
  return left;
}

function parseTerm(q: Q): Cond {
  const t = q.next();
  if (t.k === 'str' || t.k === 'num') {
    const v = t.v;
    return () => v;
  }
  if (t.k === 'id') {
    const up = t.v.toUpperCase();
    if (up === 'TRUE') return () => 1;
    if (up === 'FALSE') return () => 0;
    if (['AND', 'OR', 'NOT', 'FROM', 'WHERE', 'SELECT', 'UNION'].includes(up)) throw new Error(sqlError(t.v));
    const col = t.v.split('.').pop()!;
    return (row) => {
      if (!(col in row)) throw new Error(`Unknown column '${col}' in 'where clause'`);
      return row[col];
    };
  }
  if (t.k === 'op' && t.v === '(') {
    const e = parseOr(q);
    if (!q.op(')')) throw new Error(sqlError(q.near()));
    q.next();
    return e;
  }
  if (t.k === 'ph') throw new Error('The query has placeholders but no values were passed for them.');
  throw new Error(sqlError(t.k === 'eof' ? '' : String(t.v)));
}

function truth(v: unknown): boolean {
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return Number(v) !== 0 && !Number.isNaN(Number(v));
  return Boolean(v);
}

function compare(op: string, a: unknown, b: unknown): number {
  let x: unknown = a;
  let y: unknown = b;
  if (typeof a === 'number' || typeof b === 'number') {
    x = Number(a);
    y = Number(b);
  }
  const r =
    op === '='
      ? x === y
      : op === '<>' || op === '!='
        ? x !== y
        : op === '<'
          ? (x as number) < (y as number)
          : op === '>'
            ? (x as number) > (y as number)
            : op === '<='
              ? (x as number) <= (y as number)
              : (x as number) >= (y as number);
  return r ? 1 : 0;
}

function like(s: string, pattern: string): number {
  const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
  return re.test(s) ? 1 : 0;
}

/** Run one SELECT against a table. */
export function query(sql: string, tables: Record<string, Row[]>): SqlResult {
  try {
    const q = new Q(lex(sql));
    if (!q.kw('SELECT')) throw new Error(sqlError(q.near()));
    q.next();
    while (!q.kw('FROM')) {
      if (q.peek().k === 'eof') throw new Error(sqlError(''));
      q.next();
    }
    q.next();
    const tt = q.next();
    if (tt.k !== 'id') throw new Error(sqlError(q.near()));
    const table = tables[tt.v];
    if (!table) throw new Error(`Table '${tt.v}' doesn't exist`);
    let cond: Cond = () => 1;
    if (q.kw('WHERE')) {
      q.next();
      cond = parseOr(q);
    }
    let limit = Infinity;
    if (q.kw('LIMIT')) {
      q.next();
      const n = q.next();
      if (n.k !== 'num') throw new Error(sqlError(q.near()));
      limit = n.v;
    }
    if (q.op(';')) q.next();
    if (q.kw('UNION')) throw new Error('This little database only answers one SELECT at a time.');
    if (q.peek().k !== 'eof') throw new Error(sqlError(q.near()));
    const rows = table.filter((r) => truth(cond(r))).slice(0, limit);
    return { ok: true, rows, sql };
  } catch (e) {
    return { ok: false, rows: [], error: e instanceof Error ? e.message : String(e), sql };
  }
}
