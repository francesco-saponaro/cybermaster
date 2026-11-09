// A tiny interpreter for the handful of JavaScript the Arena's server code
// uses: declarations, if/else, return, calls, member access, template strings,
// regex literals and the usual operators. No loops, no functions, no access to
// the real page: every value comes from the environment the level passes in.
// This is how a fix is judged: the player's code is run against the attack and
// against normal use, so any correct way of writing it passes.

type Tok =
  | { k: 'id'; v: string; pos: number }
  | { k: 'num'; v: number; pos: number }
  | { k: 'str'; v: string; pos: number }
  | { k: 'tpl'; parts: string[]; exprs: string[]; pos: number }
  | { k: 're'; src: string; flags: string; pos: number }
  | { k: 'p'; v: string; pos: number }
  | { k: 'eof'; pos: number };

export class JsError extends Error {
  line: number;
  constructor(message: string, line = 0) {
    super(message);
    this.line = line;
  }
}

const PUNCT = ['===', '!==', '...', '?.', '==', '!=', '<=', '>=', '&&', '||', '??', '=>', '(', ')', '{', '}', '[', ']', ',', ';', '.', ':', '?', '!', '=', '<', '>', '+', '-', '*', '/', '%'];

function lineOf(src: string, pos: number): number {
  return src.slice(0, pos).split('\n').length;
}

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const prevAllowsRegex = () => {
    const t = out[out.length - 1];
    if (!t) return true;
    if (t.k === 'p') return !(t.v === ')' || t.v === ']' || t.v === '}');
    if (t.k === 'id') return ['return', 'typeof', 'case'].includes(t.v);
    return false;
  };
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    const start = i;
    if (/[A-Za-z_$]/.test(c)) {
      while (i < src.length && /[\w$]/.test(src[i]!)) i++;
      out.push({ k: 'id', v: src.slice(start, i), pos: start });
      continue;
    }
    if (/\d/.test(c)) {
      while (i < src.length && /[\d.]/.test(src[i]!)) i++;
      out.push({ k: 'num', v: Number(src.slice(start, i)), pos: start });
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      let s = '';
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\n') throw new JsError('A string is missing its closing quote.', lineOf(src, start));
        if (src[i] === '\\') {
          const n = src[i + 1] ?? '';
          s += n === 'n' ? '\n' : n === 't' ? '\t' : n;
          i += 2;
        } else s += src[i++];
      }
      if (i >= src.length) throw new JsError('A string is missing its closing quote.', lineOf(src, start));
      i++;
      out.push({ k: 'str', v: s, pos: start });
      continue;
    }
    if (c === '`') {
      i++;
      const parts: string[] = [];
      const exprs: string[] = [];
      let s = '';
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') {
          s += src[i + 1] ?? '';
          i += 2;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          parts.push(s);
          s = '';
          i += 2;
          let depth = 1;
          const es = i;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth > 0) i++;
          }
          exprs.push(src.slice(es, i));
          i++;
        } else s += src[i++];
      }
      if (i >= src.length) throw new JsError('A template string is missing its closing backtick.', lineOf(src, start));
      i++;
      parts.push(s);
      out.push({ k: 'tpl', parts, exprs, pos: start });
      continue;
    }
    if (c === '/' && prevAllowsRegex()) {
      i++;
      let body = '';
      let inClass = false;
      while (i < src.length && (src[i] !== '/' || inClass)) {
        if (src[i] === '\n') throw new JsError('A regular expression is missing its closing slash.', lineOf(src, start));
        if (src[i] === '\\') {
          body += src[i]! + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (src[i] === '[') inClass = true;
        if (src[i] === ']') inClass = false;
        body += src[i++];
      }
      i++;
      let flags = '';
      while (i < src.length && /[gimsuy]/.test(src[i]!)) flags += src[i++];
      out.push({ k: 're', src: body, flags, pos: start });
      continue;
    }
    const p = PUNCT.find((x) => src.startsWith(x, i));
    if (!p) throw new JsError(`Unexpected character "${c}".`, lineOf(src, start));
    out.push({ k: 'p', v: p, pos: start });
    i += p.length;
  }
  out.push({ k: 'eof', pos: src.length });
  return out;
}

// ---- AST --------------------------------------------------------------------

type Node =
  | { t: 'lit'; v: unknown }
  | { t: 'id'; name: string }
  | { t: 'tpl'; parts: string[]; exprs: Node[] }
  | { t: 're'; src: string; flags: string }
  | { t: 'arr'; items: { spread: boolean; e: Node }[] }
  | { t: 'obj'; props: ({ spread: true; e: Node } | { spread: false; key: string; e: Node })[] }
  | { t: 'mem'; obj: Node; prop: Node | string; optional: boolean }
  | { t: 'call'; callee: Node; args: Node[]; optional: boolean }
  | { t: 'new'; callee: Node; args: Node[] }
  | { t: 'un'; op: string; e: Node }
  | { t: 'bin'; op: string; l: Node; r: Node }
  | { t: 'cond'; test: Node; a: Node; b: Node };

type Stmt =
  | { t: 'decl'; names: string[]; pattern: 'id' | 'obj' | 'arr'; init: Node; line: number }
  | { t: 'assign'; target: string; e: Node; line: number }
  | { t: 'if'; test: Node; then: Stmt; else: Stmt | null; line: number }
  | { t: 'block'; body: Stmt[]; line: number }
  | { t: 'ret'; e: Node | null; line: number }
  | { t: 'expr'; e: Node; line: number };

const BIN_PREC: Record<string, number> = {
  '??': 1,
  '||': 2,
  '&&': 3,
  '===': 6,
  '!==': 6,
  '==': 6,
  '!=': 6,
  '<': 7,
  '>': 7,
  '<=': 7,
  '>=': 7,
  instanceof: 7,
  in: 7,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
};

class Parser {
  private i = 0;
  private toks: Tok[];
  private src: string;
  constructor(src: string) {
    this.src = src;
    this.toks = tokenize(src);
  }
  private peek(o = 0): Tok {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)]!;
  }
  private next(): Tok {
    return this.toks[this.i++]!;
  }
  private line(): number {
    return lineOf(this.src, this.peek().pos);
  }
  private isP(v: string, o = 0): boolean {
    const t = this.peek(o);
    return t.k === 'p' && t.v === v;
  }
  private isId(v: string): boolean {
    const t = this.peek();
    return t.k === 'id' && t.v === v;
  }
  private expect(v: string): void {
    if (!this.isP(v)) {
      const t = this.peek();
      const got = t.k === 'eof' ? 'the end of the code' : t.k === 'p' || t.k === 'id' ? `"${t.v}"` : 'a value';
      throw new JsError(`Expected "${v}" but found ${got}.`, this.line());
    }
    this.i++;
  }
  private semi(): void {
    if (this.isP(';')) this.i++;
  }

  program(): Stmt[] {
    const body: Stmt[] = [];
    while (this.peek().k !== 'eof') body.push(this.statement());
    return body;
  }

  private statement(): Stmt {
    const line = this.line();
    if (this.isP('{')) {
      this.i++;
      const body: Stmt[] = [];
      while (!this.isP('}')) {
        if (this.peek().k === 'eof') throw new JsError('A block is missing its closing "}".', line);
        body.push(this.statement());
      }
      this.i++;
      return { t: 'block', body, line };
    }
    if (this.isId('const') || this.isId('let') || this.isId('var')) {
      this.i++;
      if (this.isP('{') || this.isP('[')) {
        const close = this.isP('{') ? '}' : ']';
        const pattern = close === '}' ? 'obj' : 'arr';
        this.i++;
        const names: string[] = [];
        while (!this.isP(close)) {
          const t = this.next();
          if (t.k !== 'id') throw new JsError('Only plain names can be destructured here.', line);
          names.push(t.v);
          if (this.isP(',')) this.i++;
        }
        this.i++;
        this.expect('=');
        const init = this.expr();
        this.semi();
        return { t: 'decl', names, pattern, init, line };
      }
      const t = this.next();
      if (t.k !== 'id') throw new JsError('A declaration needs a name.', line);
      this.expect('=');
      const init = this.expr();
      this.semi();
      return { t: 'decl', names: [t.v], pattern: 'id', init, line };
    }
    if (this.isId('if')) {
      this.i++;
      this.expect('(');
      const test = this.expr();
      this.expect(')');
      const then = this.statement();
      let els: Stmt | null = null;
      if (this.isId('else')) {
        this.i++;
        els = this.statement();
      }
      return { t: 'if', test, then, else: els, line };
    }
    if (this.isId('return')) {
      this.i++;
      if (this.isP(';') || this.isP('}') || this.peek().k === 'eof') {
        this.semi();
        return { t: 'ret', e: null, line };
      }
      const e = this.expr();
      this.semi();
      return { t: 'ret', e, line };
    }
    if (this.isId('for') || this.isId('while') || this.isId('function') || this.isId('do')) {
      throw new JsError(`"${(this.peek() as { v: string }).v}" is not needed here. Keep to if, return and calls.`, line);
    }
    const t0 = this.peek();
    if (t0.k === 'id' && this.isP('=', 1)) {
      this.i += 2;
      const e = this.expr();
      this.semi();
      return { t: 'assign', target: t0.v, e, line };
    }
    const e = this.expr();
    this.semi();
    return { t: 'expr', e, line };
  }

  expr(): Node {
    return this.ternary();
  }

  private ternary(): Node {
    const test = this.binary(0);
    if (this.isP('?')) {
      this.i++;
      const a = this.ternary();
      this.expect(':');
      const b = this.ternary();
      return { t: 'cond', test, a, b };
    }
    return test;
  }

  private binary(min: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const op = t.k === 'p' ? t.v : t.k === 'id' && (t.v === 'instanceof' || t.v === 'in') ? t.v : '';
      const prec = BIN_PREC[op];
      if (prec === undefined || prec <= min) return left;
      this.i++;
      const right = this.binary(prec);
      left = { t: 'bin', op, l: left, r: right };
    }
  }

  private unary(): Node {
    if (this.isP('!') || this.isP('-') || this.isP('+')) {
      const op = (this.next() as { v: string }).v;
      return { t: 'un', op, e: this.unary() };
    }
    if (this.isId('typeof') || this.isId('await') || this.isId('void')) {
      const op = (this.next() as { v: string }).v;
      return { t: 'un', op, e: this.unary() };
    }
    return this.postfix();
  }

  private args(): Node[] {
    this.expect('(');
    const args: Node[] = [];
    while (!this.isP(')')) {
      args.push(this.expr());
      if (this.isP(',')) this.i++;
      else if (!this.isP(')')) throw new JsError('Expected "," or ")" between arguments.', this.line());
    }
    this.i++;
    return args;
  }

  private postfix(): Node {
    let e = this.primary();
    for (;;) {
      if (this.isP('.')) {
        this.i++;
        const t = this.next();
        if (t.k !== 'id') throw new JsError('Expected a property name after ".".', this.line());
        e = { t: 'mem', obj: e, prop: t.v, optional: false };
      } else if (this.isP('?.')) {
        this.i++;
        if (this.isP('(')) e = { t: 'call', callee: e, args: this.args(), optional: true };
        else {
          const t = this.next();
          if (t.k !== 'id') throw new JsError('Expected a property name after "?.".', this.line());
          e = { t: 'mem', obj: e, prop: t.v, optional: true };
        }
      } else if (this.isP('[')) {
        this.i++;
        const prop = this.expr();
        this.expect(']');
        e = { t: 'mem', obj: e, prop, optional: false };
      } else if (this.isP('(')) {
        e = { t: 'call', callee: e, args: this.args(), optional: false };
      } else return e;
    }
  }

  private primary(): Node {
    const t = this.next();
    switch (t.k) {
      case 'num':
        return { t: 'lit', v: t.v };
      case 'str':
        return { t: 'lit', v: t.v };
      case 're':
        return { t: 're', src: t.src, flags: t.flags };
      case 'tpl':
        return { t: 'tpl', parts: t.parts, exprs: t.exprs.map((s) => new Parser(s).expr()) };
      case 'id': {
        if (t.v === 'true') return { t: 'lit', v: true };
        if (t.v === 'false') return { t: 'lit', v: false };
        if (t.v === 'null') return { t: 'lit', v: null };
        if (t.v === 'undefined') return { t: 'lit', v: undefined };
        if (t.v === 'new') {
          const callee = this.primaryNoCall();
          const args = this.isP('(') ? this.args() : [];
          return { t: 'new', callee, args };
        }
        return { t: 'id', name: t.v };
      }
      case 'p': {
        if (t.v === '(') {
          const e = this.expr();
          this.expect(')');
          return e;
        }
        if (t.v === '[') {
          const items: { spread: boolean; e: Node }[] = [];
          while (!this.isP(']')) {
            const spread = this.isP('...');
            if (spread) this.i++;
            items.push({ spread, e: this.expr() });
            if (this.isP(',')) this.i++;
            else if (!this.isP(']')) throw new JsError('Expected "," or "]" in the list.', this.line());
          }
          this.i++;
          return { t: 'arr', items };
        }
        if (t.v === '{') {
          const props: ({ spread: true; e: Node } | { spread: false; key: string; e: Node })[] = [];
          while (!this.isP('}')) {
            if (this.isP('...')) {
              this.i++;
              props.push({ spread: true, e: this.expr() });
            } else {
              const k = this.next();
              if (k.k !== 'id' && k.k !== 'str') throw new JsError('Expected a property name in the object.', this.line());
              const key = String(k.v);
              if (this.isP(':')) {
                this.i++;
                props.push({ spread: false, key, e: this.expr() });
              } else props.push({ spread: false, key, e: { t: 'id', name: key } });
            }
            if (this.isP(',')) this.i++;
            else if (!this.isP('}')) throw new JsError('Expected "," or "}" in the object.', this.line());
          }
          this.i++;
          return { t: 'obj', props };
        }
        throw new JsError(`Unexpected "${t.v}".`, lineOf(this.src, t.pos));
      }
      default:
        throw new JsError('The code ends too early.', lineOf(this.src, t.pos));
    }
  }

  private primaryNoCall(): Node {
    let e: Node = this.primary();
    while (this.isP('.')) {
      this.i++;
      const t = this.next();
      if (t.k !== 'id') throw new JsError('Expected a property name after ".".', this.line());
      e = { t: 'mem', obj: e, prop: t.v, optional: false };
    }
    return e;
  }
}

// ---- Evaluation -------------------------------------------------------------

const BLOCKED = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__lookupGetter__']);
const STRING_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'toLowerCase', 'toUpperCase', 'trim', 'replace', 'replaceAll', 'split', 'slice', 'indexOf', 'match', 'padStart']);
const ARRAY_METHODS = new Set(['includes', 'indexOf', 'join', 'slice', 'concat']);

/** A host function the interpreter may call. Plain JS functions in the env are wrapped as this. */
export type HostFn = (...args: unknown[]) => unknown;

class Return {
  value: unknown;
  constructor(value: unknown) {
    this.value = value;
  }
}

export interface RunResult {
  returned: boolean;
  value: unknown;
}

export function parseProgram(src: string): Stmt[] {
  return new Parser(src).program();
}

/** Run a function body. `env` holds every name the code may use. */
export function run(src: string, env: Record<string, unknown>): RunResult {
  const body = parseProgram(src);
  const scope = new Map<string, unknown>(Object.entries(env));
  try {
    for (const s of body) exec(s, scope);
  } catch (e) {
    if (e instanceof Return) return { returned: true, value: e.value };
    throw e;
  }
  return { returned: false, value: undefined };
}

function exec(s: Stmt, scope: Map<string, unknown>): void {
  try {
    switch (s.t) {
      case 'decl': {
        const v = evaluate(s.init, scope);
        if (s.pattern === 'id') scope.set(s.names[0]!, v);
        else if (s.pattern === 'obj') {
          if (v === null || typeof v !== 'object') throw new JsError('Cannot destructure something that is not an object.', s.line);
          for (const n of s.names) scope.set(n, getProp(v, n));
        } else {
          if (!Array.isArray(v)) throw new JsError('Cannot destructure something that is not a list.', s.line);
          s.names.forEach((n, i) => scope.set(n, v[i]));
        }
        return;
      }
      case 'assign':
        if (!scope.has(s.target)) throw new JsError(`${s.target} is not defined.`, s.line);
        scope.set(s.target, evaluate(s.e, scope));
        return;
      case 'if':
        if (truthy(evaluate(s.test, scope))) exec(s.then, scope);
        else if (s.else) exec(s.else, scope);
        return;
      case 'block':
        for (const b of s.body) exec(b, scope);
        return;
      case 'ret':
        throw new Return(s.e ? evaluate(s.e, scope) : undefined);
      case 'expr':
        evaluate(s.e, scope);
        return;
    }
  } catch (e) {
    if (e instanceof JsError && !e.line) e.line = s.line;
    throw e;
  }
}

function truthy(v: unknown): boolean {
  return Boolean(v);
}

function getProp(obj: unknown, key: string | number): unknown {
  if (typeof key === 'string' && BLOCKED.has(key)) throw new JsError(`"${key}" is not available here.`);
  if (obj === null || obj === undefined) throw new JsError(`Cannot read "${String(key)}" of ${String(obj)}.`);
  if (typeof obj === 'string') {
    if (key === 'length') return obj.length;
    if (typeof key === 'number') return obj[key];
    if (STRING_METHODS.has(key)) return (obj as unknown as Record<string, HostFn>)[key]!.bind(obj);
    return undefined;
  }
  if (Array.isArray(obj)) {
    if (key === 'length') return obj.length;
    if (typeof key === 'number') return obj[key];
    if (/^\d+$/.test(String(key))) return obj[Number(key)];
    if (ARRAY_METHODS.has(String(key))) return (obj as unknown as Record<string, HostFn>)[String(key)]!.bind(obj);
    return undefined;
  }
  if (obj instanceof RegExp) {
    if (key === 'test') return (s: unknown) => obj.test(String(s));
    return undefined;
  }
  if (obj instanceof Set) {
    if (key === 'has') return (x: unknown) => obj.has(x);
    if (key === 'size') return obj.size;
    return undefined;
  }
  if (obj instanceof URL) {
    const allowed = ['hostname', 'host', 'protocol', 'port', 'pathname', 'href', 'origin', 'search'];
    return allowed.includes(String(key)) ? (obj as unknown as Record<string, unknown>)[String(key)] : undefined;
  }
  if (typeof obj === 'object') {
    return Object.prototype.hasOwnProperty.call(obj, key) ? (obj as Record<string, unknown>)[String(key)] : undefined;
  }
  return undefined;
}

function evaluate(n: Node, scope: Map<string, unknown>): unknown {
  switch (n.t) {
    case 'lit':
      return n.v;
    case 'id':
      if (!scope.has(n.name)) throw new JsError(`${n.name} is not defined.`);
      return scope.get(n.name);
    case 'tpl': {
      let s = n.parts[0] ?? '';
      n.exprs.forEach((e, i) => {
        s += String(evaluate(e, scope)) + (n.parts[i + 1] ?? '');
      });
      return s;
    }
    case 're':
      try {
        return new RegExp(n.src, n.flags);
      } catch {
        throw new JsError('That regular expression is not valid.');
      }
    case 'arr': {
      const out: unknown[] = [];
      for (const it of n.items) {
        const v = evaluate(it.e, scope);
        if (it.spread) {
          if (!Array.isArray(v)) throw new JsError('Only a list can be spread into a list.');
          out.push(...v);
        } else out.push(v);
      }
      return out;
    }
    case 'obj': {
      const out: Record<string, unknown> = {};
      for (const p of n.props) {
        if (p.spread) {
          const v = evaluate(p.e, scope);
          if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) if (!BLOCKED.has(k)) out[k] = val;
        } else {
          if (BLOCKED.has(p.key)) throw new JsError(`"${p.key}" is not available here.`);
          out[p.key] = evaluate(p.e, scope);
        }
      }
      return out;
    }
    case 'mem': {
      const obj = evaluate(n.obj, scope);
      if (n.optional && (obj === null || obj === undefined)) return undefined;
      const key = typeof n.prop === 'string' ? n.prop : (evaluate(n.prop, scope) as string | number);
      return getProp(obj, typeof key === 'number' ? key : String(key));
    }
    case 'call': {
      const fn = evaluate(n.callee, scope);
      if (n.optional && (fn === null || fn === undefined)) return undefined;
      if (typeof fn !== 'function') throw new JsError(`${describe(n.callee)} is not a function.`);
      const args = n.args.map((a) => evaluate(a, scope));
      return (fn as HostFn)(...args);
    }
    case 'new': {
      const ctor = evaluate(n.callee, scope);
      const args = n.args.map((a) => evaluate(a, scope));
      if (ctor === URL) {
        try {
          return new URL(String(args[0]), args[1] === undefined ? undefined : String(args[1]));
        } catch {
          throw new JsError(`Invalid URL: ${String(args[0])}`);
        }
      }
      if (ctor === Set) return new Set(Array.isArray(args[0]) ? args[0] : []);
      if (ctor === RegExp) return new RegExp(String(args[0]), args[1] === undefined ? undefined : String(args[1]));
      if (ctor === Error) return new Error(String(args[0] ?? ''));
      throw new JsError(`${describe(n.callee)} cannot be used with new here.`);
    }
    case 'un': {
      if (n.op === 'typeof') {
        try {
          return typeof evaluate(n.e, scope);
        } catch {
          return 'undefined';
        }
      }
      const v = evaluate(n.e, scope);
      if (n.op === '!') return !truthy(v);
      if (n.op === '-') return -Number(v);
      if (n.op === '+') return Number(v);
      return v; // await, void: the host functions are synchronous
    }
    case 'bin': {
      if (n.op === '&&') {
        const l = evaluate(n.l, scope);
        return truthy(l) ? evaluate(n.r, scope) : l;
      }
      if (n.op === '||') {
        const l = evaluate(n.l, scope);
        return truthy(l) ? l : evaluate(n.r, scope);
      }
      if (n.op === '??') {
        const l = evaluate(n.l, scope);
        return l === null || l === undefined ? evaluate(n.r, scope) : l;
      }
      const l = evaluate(n.l, scope) as never;
      const r = evaluate(n.r, scope) as never;
      switch (n.op) {
        case '===':
          return l === r;
        case '!==':
          return l !== r;
        case '==':
          // eslint-disable-next-line eqeqeq
          return l == r;
        case '!=':
          // eslint-disable-next-line eqeqeq
          return l != r;
        case '<':
          return l < r;
        case '>':
          return l > r;
        case '<=':
          return l <= r;
        case '>=':
          return l >= r;
        case '+':
          return (l as number) + (r as number);
        case '-':
          return (l as number) - (r as number);
        case '*':
          return (l as number) * (r as number);
        case '/':
          return (l as number) / (r as number);
        case '%':
          return (l as number) % (r as number);
        case 'in':
          return r !== null && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, String(l));
        case 'instanceof':
          return false;
      }
      throw new JsError(`Operator ${n.op} is not supported.`);
    }
    case 'cond':
      return truthy(evaluate(n.test, scope)) ? evaluate(n.a, scope) : evaluate(n.b, scope);
  }
}

function describe(n: Node): string {
  if (n.t === 'id') return n.name;
  if (n.t === 'mem') return `${describe(n.obj)}.${typeof n.prop === 'string' ? n.prop : '[...]'}`;
  return 'That';
}
