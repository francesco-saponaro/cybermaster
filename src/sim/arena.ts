// The Arena's six little vulnerable apps, played defence first. Each has a
// route handler in plain JavaScript, one region the player may edit, and a
// backend the handler talks to. Recorded attacks are not real payloads: each
// hostile input is a category marker (a token that stands for "input
// containing a quote that ends the string early", for example). The backends
// decide whether that kind of input reached a dangerous place unescaped, the
// way a real one would be hurt by it. The player's fix runs through the same
// interpreter, so any correct way of writing it passes.

import { run, JsError } from './js';
import { bind, query, type Row } from './sql';
import { escapeHtml, sanitizeHtml } from './html';

export type ArenaAppId = 'login' | 'search' | 'invoices' | 'ping' | 'preview' | 'signup';
export type AppInput = Record<string, string>;

/** Category markers. They carry the one character that matters to the sink, and nothing that runs. */
export const MARK = {
  sqlBreakout: "'⟦ends-the-string⟧",
  sqlComment: "'⟦comments-out-the-rest⟧",
  sqlAlwaysTrue: "'⟦always-true-condition⟧",
  markup: '<x-injected-markup>',
  markupAttr: '"<x-injected-attribute>',
  shellChain: '⟦chains-a-second-command⟧',
  shellSubst: '⟦substitutes-a-command⟧',
} as const;

const SQL_MARKS = [MARK.sqlBreakout, MARK.sqlComment, MARK.sqlAlwaysTrue];
const SHELL_MARKS = [MARK.shellChain, MARK.shellSubst];

/** Plain-words names for each marker, for the replay panel and the logs. */
export const CATEGORY: Record<string, string> = {
  [MARK.sqlBreakout]: 'a name containing a quote that ends the SQL string early',
  [MARK.sqlComment]: 'a name that ends the string and comments out the password check',
  [MARK.sqlAlwaysTrue]: 'a name that ends the string and adds a condition that is always true',
  [MARK.markup]: 'a search containing markup the browser would treat as part of the page',
  [MARK.markupAttr]: 'a search that closes an attribute and adds markup',
  [MARK.shellChain]: 'a host followed by a shell separator and a second command',
  [MARK.shellSubst]: 'a host containing a shell command substitution',
};

export function describeInput(value: string): string {
  for (const [m, d] of Object.entries(CATEGORY)) if (value.includes(m)) return d;
  return value;
}

/** Replace markers with their plain-words description, for logs shown to the player. */
function redact(text: string): string {
  let out = text;
  for (const m of Object.keys(CATEGORY)) out = out.split(m).join('[hostile input]');
  return out;
}

export interface Reply {
  status: number;
  body: unknown;
  /** What the server did, one line per step, for the server log strip. */
  log: string[];
  error?: string;
  /** The recorded attack reached its sink and did harm. */
  harmed?: boolean;
}

export interface CodeParts {
  head: string;
  pre: string;
  edit: string;
  post: string;
  foot: string;
  fix: string;
  /** 0-based index, within `edit`, of the line where the input becomes dangerous. */
  faultLine: number;
}

export interface ReplayStep {
  who: 'Attacker' | 'Server' | 'Result';
  text: string;
}

export interface ArenaApp {
  id: ArenaAppId;
  code: CodeParts;
  /** The recorded attack, and the other attacks of the same family the test suite replays. */
  attack: AppInput;
  variants: AppInput[];
  normal: AppInput[];
  /** The incident, in plain words, as it happened against the original code. */
  replay: ReplayStep[];
  /** What the player sees when the attack fails against their fix. */
  blockedText: string;
  normalText: string;
  exploited(input: AppInput, reply: Reply): boolean;
  normalOk(input: AppInput, reply: Reply): boolean;
  variantReason: string;
}

// ---- Shared host objects ----------------------------------------------------

function makeRes() {
  const withStatus = (status: number) => ({
    json: (body: unknown) => ({ status, body }),
    send: (body: unknown) => ({ status, body }),
    end: () => ({ status, body: null }),
  });
  return {
    status: (n: unknown) => withStatus(Number(n)),
    json: (body: unknown) => ({ status: 200, body }),
    send: (body: unknown) => ({ status: 200, body }),
    sendStatus: (n: unknown) => ({ status: Number(n), body: null }),
    end: () => ({ status: 200, body: null }),
  };
}

function isReply(v: unknown): v is { status: number; body: unknown } {
  return typeof v === 'object' && v !== null && 'status' in v && typeof (v as { status: unknown }).status === 'number';
}

function handle(code: string, env: Record<string, unknown>, log: string[], offset: number, editLines: number): Reply {
  try {
    const out = run(code, { ...env, res: makeRes() });
    if (!out.returned || !isReply(out.value)) {
      return { status: 500, body: 'The handler finished without sending a response.', log, error: 'The handler must end with return res.send(...) or similar.' };
    }
    return { status: out.value.status, body: out.value.body, log };
  } catch (e) {
    if (e instanceof JsError) {
      const line = Math.min(Math.max(1, e.line - offset), editLines);
      const where = e.line ? ` (line ${line} of your code)` : '';
      return { status: 500, body: e.message, log, error: e.message + where };
    }
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`error: ${redact(msg)}`);
    return { status: 500, body: redact(msg), log };
  }
}

export function assemble(app: ArenaApp, edit: string): string {
  return [app.code.pre, edit, app.code.post].filter((s) => s.trim() !== '').join('\n');
}

// ---- 1. Login: input in a SQL string ----------------------------------------

export const USERS: Row[] = [
  { id: 1, name: 'admin', pass: 'S3cure!Lamp#91', role: 'admin' },
  { id: 2, name: 'alice', pass: 'tulip-river-42', role: 'customer' },
  { id: 3, name: 'sam', pass: 'brass&oak77', role: 'customer' },
];

/** Does a marker sit outside every string literal of this SQL text, i.e. did input become query structure? */
export function inputEscapedLiteral(sql: string): boolean {
  const outside = sql.replace(/'(?:[^']|'')*'/g, '');
  return SQL_MARKS.some((m) => outside.includes(m.slice(1)));
}

function loginEnv(input: AppInput, log: string[], extra: Record<string, unknown> = {}) {
  return {
    req: { body: { name: input.name ?? '', pass: input.pass ?? '' } },
    db: {
      query: (sql: unknown, params?: unknown) => {
        const bound = bind(String(sql), params);
        if (bound.error) throw new Error(bound.error);
        log.push(`SQL  ${redact(bound.sql)}`);
        if (inputEscapedLiteral(bound.sql)) {
          log.push('the input ended the string: the rest of it was read as SQL, and the password check no longer applied');
          return [USERS[0]];
        }
        const r = query(bound.sql, { users: USERS });
        if (!r.ok) throw new Error(r.error ?? 'SQL error');
        log.push(`rows ${r.rows.length}`);
        return r.rows;
      },
    },
    welcome: (row: unknown) => {
      const r = row as Row;
      return `Welcome, ${String(r?.name ?? '?')} (${String(r?.role ?? '?')})`;
    },
    ...extra,
  };
}

export function loggedInAs(reply: Reply): string | null {
  if (reply.status !== 200 || typeof reply.body !== 'string') return null;
  const m = /^Welcome, (\w+)/.exec(reply.body);
  return m ? (m[1] ?? null) : null;
}

const loginExploited = (input: AppInput, reply: Reply) => {
  const who = loggedInAs(reply);
  if (!who) return false;
  const user = USERS.find((u) => u.name === who);
  return !user || user.pass !== input.pass;
};

const login: ArenaApp = {
  id: 'login',
  code: {
    head: "app.post('/login', (req, res) => {",
    pre: '  const { name, pass } = req.body;',
    edit: `  const sql = "SELECT * FROM users WHERE name = '" + name + "' AND pass = '" + pass + "'";
  const rows = db.query(sql);`,
    post: `  if (rows.length === 0) return res.status(401).send('Wrong name or password');
  return res.send(welcome(rows[0]));`,
    foot: '});',
    fix: `  const sql = 'SELECT * FROM users WHERE name = ? AND pass = ?';
  const rows = db.query(sql, [name, pass]);`,
    faultLine: 0,
  },
  attack: { name: MARK.sqlComment, pass: 'anything' },
  variants: [{ name: MARK.sqlAlwaysTrue, pass: 'anything' }, { name: MARK.sqlBreakout, pass: MARK.sqlAlwaysTrue }],
  normal: [
    { name: 'alice', pass: 'tulip-river-42' },
    { name: 'alice', pass: 'wrong-guess' },
    { name: "O'Brien", pass: 'x' },
  ],
  replay: [
    { who: 'Attacker', text: 'Types a name containing a quote that ends the SQL string early, then comments out the rest of the query. Any password.' },
    { who: 'Server', text: 'Glues the name into the query text. The quote closes the string, so the rest of the name is read as SQL and the password check drops out.' },
    { who: 'Result', text: 'Signed in as admin, with no password.' },
  ],
  blockedText: 'The name arrives as a value, quote and all. No user has that name: 401 Wrong name or password.',
  normalText: 'Alice signs in with her password; a wrong password is refused; a name with an apostrophe does not break the query.',
  exploited: loginExploited,
  normalOk(input, reply) {
    const user = USERS.find((u) => u.name === input.name);
    const correct = user && user.pass === input.pass;
    if (correct) return loggedInAs(reply) === input.name;
    return reply.status === 401;
  },
  variantReason: 'Another input of the same kind still changes the query. Use ? placeholders and pass [name, pass] to db.query, as in the example, and replay.',
};

/** The developers' first attempt at a fix, for the Report zone's retest: it rejects one category only. */
export function loginWithFilterEnv(input: AppInput, log: string[]) {
  return loginEnv(input, log, {
    looksLikeTheReportedAttack: (s: unknown) => String(s).includes(MARK.sqlComment.slice(1)),
  });
}

// ---- 2. Search: input in HTML -------------------------------------------------

export const CATALOGUE = ['Atelier brass desk lamp', 'Brass picture light', 'Quai wall light', 'Bobbin pendant', 'Oak floor lamp'];

function searchEnv(input: AppInput, log: string[]) {
  const q = input.q ?? '';
  const hits = CATALOGUE.filter((c) => q.trim() !== '' && c.toLowerCase().includes(q.toLowerCase().trim()));
  log.push(`search "${redact(q)}" -> ${hits.length} result${hits.length === 1 ? '' : 's'}`);
  const encode = (s: unknown) => escapeHtml(s);
  return {
    req: { query: { q } },
    catalogue: { search: () => hits },
    list: (items: unknown) => '<ul>' + (Array.isArray(items) ? items : []).map((i) => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>',
    escapeHtml: encode,
    escapeHTML: encode,
    encodeHTML: encode,
    htmlEscape: encode,
    he: { encode, escape: encode },
    _: { escape: encode },
    validator: { escape: encode },
    DOMPurify: { sanitize: (s: unknown) => sanitizeHtml(s) },
  };
}

/** Did hostile markup reach the page as markup, rather than as text? */
export function markupInPage(html: string): boolean {
  return html.includes('<x-injected');
}

/** The visible text of a page, tags dropped and entities decoded. */
export function pageText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const search: ArenaApp = {
  id: 'search',
  code: {
    head: "app.get('/search', (req, res) => {",
    pre: "  const q = req.query.q ?? '';\n  const hits = catalogue.search(q);",
    edit: "  return res.send('<h2>Results for ' + q + '</h2>' + list(hits));",
    post: '',
    foot: '});\n// helpers you can use: escapeHtml(text)',
    fix: "  return res.send('<h2>Results for ' + escapeHtml(q) + '</h2>' + list(hits));",
    faultLine: 0,
  },
  attack: { q: MARK.markup },
  variants: [{ q: MARK.markupAttr }],
  normal: [{ q: 'brass' }, { q: 'Tom & Jo\'s "lamp"' }],
  replay: [
    { who: 'Attacker', text: 'Sends a customer a search link whose search words contain markup.' },
    { who: 'Server', text: 'Pastes the search words into the results page as HTML, not as text.' },
    { who: 'Result', text: "The customer's browser treats the attacker's words as part of the page, so it would run the attacker's script with the customer's session." },
  ],
  blockedText: 'The search words are encoded for HTML: the page shows them as text and nothing runs.',
  normalText: 'A search for brass lists the brass lamps, and a search with an ampersand and quotes shows them as typed.',
  exploited: (_i, reply) => typeof reply.body === 'string' && markupInPage(reply.body),
  normalOk(input, reply) {
    if (reply.status !== 200 || typeof reply.body !== 'string') return false;
    return pageText(reply.body).includes(`Results for ${(input.q ?? '').trim()}`) && !markupInPage(reply.body);
  },
  variantReason: 'Another kind of markup still reaches the page. Wrap the whole q in escapeHtml(q), as in the example, and replay.',
};

// ---- 3. Invoices: an id nobody checks ------------------------------------------

export const INVOICES: Record<string, { id: number; ownerId: string; customer: string; total: string; items: string }> = {
  '1041': { id: 1041, ownerId: 'u-17', customer: 'Mara Okafor', total: '1,260.00 EUR', items: '6 x Quai wall light' },
  '1042': { id: 1042, ownerId: 'u-17', customer: 'Mara Okafor', total: '420.00 EUR', items: '2 x Bobbin pendant' },
  '1043': { id: 1043, ownerId: 'u-23', customer: 'Sam Weller', total: '189.00 EUR', items: '1 x Atelier desk lamp' },
  '1044': { id: 1044, ownerId: 'u-31', customer: 'Atelier Rive SARL', total: '3,780.00 EUR', items: '20 x Atelier desk lamp' },
  '1048': { id: 1048, ownerId: 'u-23', customer: 'Sam Weller', total: '145.00 EUR', items: '1 x Quai wall light' },
};

function invoicesEnv(input: AppInput, log: string[]) {
  return {
    req: { params: { id: input.id ?? '' }, user: { id: 'u-23', name: 'sam' } },
    db: {
      invoices: {
        find: (id: unknown) => {
          const inv = INVOICES[String(id)];
          log.push(`db.invoices.find(${String(id)}) -> ${inv ? `invoice of ${inv.ownerId}` : 'nothing'}`);
          return inv ? { ...inv } : undefined;
        },
      },
    },
  };
}

const invoices: ArenaApp = {
  id: 'invoices',
  code: {
    head: "app.get('/api/invoices/:id', requireLogin, (req, res) => {",
    pre: '  const invoice = db.invoices.find(req.params.id);',
    edit: `  if (!invoice) return res.status(404).json({ error: 'Not found' });
  return res.json(invoice);`,
    post: '',
    foot: "});\n// req.user is the signed-in user: { id: 'u-23', name: 'sam' }",
    fix: `  if (!invoice || invoice.ownerId !== req.user.id) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json(invoice);`,
    faultLine: 1,
  },
  attack: { id: '1042' },
  variants: [{ id: '1044' }, { id: '1041' }],
  normal: [{ id: '1043' }, { id: '9999' }],
  replay: [
    { who: 'Attacker', text: 'Signs in as an ordinary customer and asks for invoice 1042 instead of their own 1043.' },
    { who: 'Server', text: 'Finds invoice 1042 and returns it. It checked that someone was signed in, not whose invoice it was.' },
    { who: 'Result', text: "Mara Okafor's invoice, address and total, in a stranger's browser." },
  ],
  blockedText: 'Invoice 1042 belongs to someone else: the server answers 404, as if it did not exist.',
  normalText: "Sam still opens his own invoice 1043, and a missing invoice is still a 404.",
  exploited(_i, reply) {
    const b = reply.body as { ownerId?: string } | null;
    return reply.status === 200 && !!b && typeof b === 'object' && b.ownerId !== 'u-23';
  },
  normalOk(input, reply) {
    const b = reply.body as { id?: number } | null;
    if (input.id === '9999') return reply.status === 404 || reply.status === 403;
    return reply.status === 200 && !!b && b.id === Number(input.id);
  },
  variantReason: "Another customer's invoice still opens. Answer 404 whenever invoice.ownerId !== req.user.id, as in the example, and replay.",
};

// ---- 4. Ping: input in a shell command line -------------------------------------

function pingOutput(host: string): string {
  const known: Record<string, string> = { '9.9.9.9': '9.9.9.9', 'harbor.example': '203.0.113.10' };
  const ip = known[host] ?? (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : null);
  if (!ip) return `ping: ${redact(host)}: Name or service not known`;
  return `PING ${host} (${ip}) 56(84) bytes of data.\n64 bytes from ${ip}: icmp_seq=1 ttl=57 time=11.8 ms\n\n--- ${host} ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss`;
}

export const SECOND_COMMAND = '[a second command ran on the server as www-data]';

function pingEnv(input: AppInput, log: string[]) {
  return {
    req: { body: { host: input.host ?? '' } },
    exec: (cmd: unknown) => {
      const line = String(cmd);
      log.push(`sh -c "${redact(line)}"`);
      const hostile = SHELL_MARKS.find((m) => line.includes(m));
      if (hostile) {
        const clean = line.split(hostile).join('').trim();
        return pingOutput(clean.split(/\s+/).pop() ?? '') + '\n' + SECOND_COMMAND;
      }
      return pingOutput(line.trim().split(/\s+/).pop() ?? '');
    },
    execFile: (file: unknown, args: unknown) => {
      const list = Array.isArray(args) ? args.map(String) : [];
      log.push(`execFile ${String(file)} [${list.map((a) => JSON.stringify(redact(a))).join(', ')}]`);
      if (String(file) !== 'ping') return `${String(file)}: not allowed`;
      return pingOutput(list[list.length - 1] ?? '');
    },
    isIP: (s: unknown) => /^(\d{1,3})(\.\d{1,3}){3}$/.test(String(s)),
    net: { isIP: (s: unknown) => (/^(\d{1,3})(\.\d{1,3}){3}$/.test(String(s)) ? 4 : 0) },
  };
}

const ping: ArenaApp = {
  id: 'ping',
  code: {
    head: "app.post('/tools/ping', requireStaff, (req, res) => {",
    pre: '  const host = req.body.host;',
    edit: `  const output = exec('ping -c 1 ' + host);
  return res.send(output);`,
    post: '',
    foot: '});\n// available: exec(commandLine), execFile(program, [args])',
    fix: `  const output = execFile('ping', ['-c', '1', host]);
  return res.send(output);`,
    faultLine: 0,
  },
  attack: { host: `9.9.9.9 ${MARK.shellChain}` },
  variants: [{ host: MARK.shellSubst }],
  normal: [{ host: '9.9.9.9' }],
  replay: [
    { who: 'Attacker', text: 'Enters a host followed by a shell separator and a second command.' },
    { who: 'Server', text: 'Builds one command line and hands it to the shell, which reads the separator as its own syntax.' },
    { who: 'Result', text: 'The ping runs, and then the second command runs on the server as www-data.' },
  ],
  blockedText: 'The host goes to ping as one argument. Ping cannot resolve it, and nothing else runs.',
  normalText: 'Pinging 9.9.9.9 still works.',
  exploited: (_i, reply) => typeof reply.body === 'string' && reply.body.includes(SECOND_COMMAND),
  normalOk: (_i, reply) => reply.status === 200 && typeof reply.body === 'string' && reply.body.includes('1 received'),
  variantReason: "Another shell trick still runs a second command. Use execFile('ping', ['-c', '1', host]) instead of exec, as in the example, and replay.",
};

// ---- 5. Link previews: the server fetches what you ask -----------------------------

export function fetchPage(href: string): { status: number; title: string; text: string; internal: boolean } {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { status: 400, title: 'Bad URL', text: '', internal: false };
  }
  let host = url.hostname.toLowerCase();
  const nip = /^(\d{1,3}(?:\.\d{1,3}){3})\.nip\.io$/.exec(host);
  if (nip) host = nip[1]!;
  if (host === '169.254.169.254') return { status: 200, title: 'Cloud metadata service', text: 'Temporary cloud credentials for the web server role', internal: true };
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(host) || host.startsWith('127.')) return { status: 200, title: 'Internal admin', text: 'Admin console, no login on the internal network', internal: true };
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return { status: 200, title: 'Internal service', text: 'Internal service', internal: true };
  if (host === 'news.example') return { status: 200, title: 'Lyon lamp makers reopen the old foundry', text: 'A short walk from the river, the foundry lights up again.', internal: false };
  if (host === 'blog.example') return { status: 200, title: 'How we polish brass', text: 'Three cloths and patience.', internal: false };
  return { status: 502, title: 'Could not reach that site', text: '', internal: false };
}

function previewEnv(input: AppInput, log: string[]) {
  return {
    req: { body: { url: input.url ?? '' } },
    URL,
    fetchPage: (href: unknown) => {
      const p = fetchPage(String(href));
      log.push(`fetch ${p.internal ? '(an internal address)' : String(href)} -> ${p.status}`);
      return p;
    },
    preview: (p: unknown) => {
      const page = p as { title: string; text: string };
      return { title: page.title, snippet: page.text };
    },
  };
}

const preview: ArenaApp = {
  id: 'preview',
  code: {
    head: "app.post('/preview', requireLogin, (req, res) => {",
    pre: "  const ALLOWED_HOSTS = ['news.example', 'blog.example'];\n  const target = new URL(req.body.url);",
    edit: `  const page = fetchPage(target.href);
  return res.json(preview(page));`,
    post: '',
    foot: '});',
    fix: `  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    return res.status(400).json({ error: 'That site is not allowed' });
  }
  const page = fetchPage(target.href);
  return res.json(preview(page));`,
    faultLine: 0,
  },
  attack: { url: 'http://169.254.169.254/latest/meta-data/' },
  variants: [{ url: 'http://localhost:8080/' }, { url: 'http://169.254.169.254.nip.io/' }, { url: 'http://[::1]/' }],
  normal: [{ url: 'https://news.example/2026/11/foundry' }],
  replay: [
    { who: 'Attacker', text: "Asks for a preview of a link that points at the cloud's internal metadata address." },
    { who: 'Server', text: 'Fetches the link from inside its own network, where that address answers.' },
    { who: 'Result', text: "The preview card shows the server's temporary cloud credentials." },
  ],
  blockedText: 'The link is not on the allow-list: 400, nothing is fetched.',
  normalText: 'A preview of a news.example article still works.',
  exploited: (input, reply) => reply.status === 200 && fetchPage(input.url ?? '').internal,
  normalOk(_i, reply) {
    const b = reply.body as { title?: string } | null;
    return reply.status === 200 && !!b && typeof b.title === 'string' && b.title.includes('foundry');
  },
  variantReason: 'Another internal address still gets through. Instead of blocking addresses, answer 400 unless ALLOWED_HOSTS.includes(target.hostname), as in the example, and replay.',
};

// ---- 6. Sign-up: the whole body saved as a record ------------------------------------

function signupEnv(input: AppInput, log: string[]) {
  let body: unknown;
  try {
    body = JSON.parse(input.body ?? '{}');
  } catch {
    body = null;
  }
  return {
    req: { body },
    db: {
      users: {
        create: (fields: unknown) => {
          const f = (fields && typeof fields === 'object' ? fields : {}) as Record<string, unknown>;
          const record = { id: 'u-58', role: 'customer', credits: 0, verified: false, ...f };
          log.push(`INSERT users ${JSON.stringify(record)}`);
          return record;
        },
      },
    },
    pick: (obj: unknown, keys: unknown) => {
      const o = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : []) if (Object.prototype.hasOwnProperty.call(o, String(k))) out[String(k)] = o[String(k)];
      return out;
    },
  };
}

const signup: ArenaApp = {
  id: 'signup',
  code: {
    head: "app.post('/api/signup', (req, res) => {",
    pre: '',
    edit: `  const user = db.users.create(req.body);
  return res.status(201).json(user);`,
    post: '',
    foot: '});\n// new users get role "customer", 0 credits, verified false',
    fix: `  const { name, email } = req.body;
  const user = db.users.create({ name, email });
  return res.status(201).json(user);`,
    faultLine: 0,
  },
  attack: { body: '{"name":"sam","email":"sam@mail.example","role":"admin"}' },
  variants: [{ body: '{"name":"sam","email":"sam@mail.example","credits":5000}' }, { body: '{"name":"sam","email":"sam@mail.example","verified":true}' }],
  normal: [{ body: '{"name":"Ines","email":"ines@mail.example"}' }],
  replay: [
    { who: 'Attacker', text: 'Signs up with the usual name and email, plus one extra field the form never shows: a role.' },
    { who: 'Server', text: 'Saves the whole request body as the new user record.' },
    { who: 'Result', text: 'A brand-new account with role admin.' },
  ],
  blockedText: 'Only name and email are copied: the extra field is ignored and the account is a customer.',
  normalText: 'Ines signs up with a name and an email and gets an ordinary customer account.',
  exploited(_i, reply) {
    const u = reply.body as Record<string, unknown> | null;
    return reply.status < 300 && !!u && typeof u === 'object' && (u.role !== 'customer' || u.credits !== 0 || u.verified !== false);
  },
  normalOk(input, reply) {
    const u = reply.body as Record<string, unknown> | null;
    const sent = JSON.parse(input.body ?? '{}') as Record<string, unknown>;
    return reply.status === 201 && !!u && u.name === sent.name && u.email === sent.email && u.role === 'customer';
  },
  variantReason: 'Another extra field still goes straight into the database. Pull out only name and email and create the user from those, as in the example, and replay.',
};

export const ARENA_APPS: Record<ArenaAppId, ArenaApp> = { login, search, invoices, ping, preview, signup };

/** Run an app's handler with some code (the original or the player's) on one input. */
export function runApp(id: ArenaAppId, edit: string, input: AppInput, envOverride?: (input: AppInput, log: string[]) => Record<string, unknown>): Reply {
  const app = ARENA_APPS[id];
  const log: string[] = [];
  const code = assemble(app, edit);
  const off = app.code.pre.trim() ? app.code.pre.split('\n').length : 0;
  const n = edit.split('\n').length;
  const envs: Record<ArenaAppId, (i: AppInput, l: string[]) => Record<string, unknown>> = {
    login: loginEnv,
    search: searchEnv,
    invoices: invoicesEnv,
    ping: pingEnv,
    preview: previewEnv,
    signup: signupEnv,
  };
  if (id === 'signup') {
    try {
      JSON.parse(input.body ?? '');
    } catch {
      return { status: 400, body: 'Body is not valid JSON', log: ['request rejected: invalid JSON'] };
    }
  }
  const reply = handle(code, (envOverride ?? envs[id])(input, log), log, off, n);
  return { ...reply, harmed: app.exploited(input, reply) };
}

export interface FixReport {
  error?: string;
  attackBlocked: boolean;
  variantsBlocked: boolean;
  normalWorks: boolean;
  reason: string;
}

/** Replay the recorded attack, its variants and normal use against some code. */
export function testFix(id: ArenaAppId, edit: string): FixReport {
  const app = ARENA_APPS[id];
  const atk = runApp(id, edit, app.attack);
  if (atk.error) return { error: atk.error, attackBlocked: false, variantsBlocked: false, normalWorks: false, reason: `${atk.error} Fix that in the code box, comparing it with the example in the step, and press Replay attack again.` };
  const attackBlocked = !atk.harmed;
  const variantsBlocked = app.variants.every((v) => !runApp(id, edit, v).harmed);
  let normalWorks = true;
  let normalError = '';
  for (const n of app.normal) {
    const r = runApp(id, edit, n);
    if (r.error) normalError = r.error;
    if (!app.normalOk(n, r)) {
      normalWorks = false;
      break;
    }
  }
  const reason = !attackBlocked
    ? 'The recorded attack still works against this code. Change the code box to match the example in the step, then press Replay attack again.'
    : !variantsBlocked
      ? app.variantReason
      : !normalWorks
        ? `${normalError ? normalError + ' ' : ''}The attack is stopped but normal use broke. Keep the rest of the code as it was, change only what the step says, and replay.`
        : '';
  return { attackBlocked, variantsBlocked, normalWorks, reason };
}

/** The full listing the player reads, and the line number (1-based) of the faulty line in it. */
export function listing(app: ArenaApp, edit: string): { lines: { text: string; region: 'head' | 'pre' | 'edit' | 'post' | 'foot' }[]; fault: number } {
  const lines: { text: string; region: 'head' | 'pre' | 'edit' | 'post' | 'foot' }[] = [];
  const push = (text: string, region: 'head' | 'pre' | 'edit' | 'post' | 'foot') => {
    if (!text.trim()) return;
    for (const t of text.split('\n')) lines.push({ text: t, region });
  };
  push(app.code.head, 'head');
  push(app.code.pre, 'pre');
  const editStart = lines.length;
  push(edit, 'edit');
  push(app.code.post, 'post');
  push(app.code.foot, 'foot');
  return { lines, fault: editStart + app.code.faultLine + 1 };
}
