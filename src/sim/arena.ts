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
  /** A challenge variant: wrong-answer texts do not point at a step. */
  challenge?: boolean;
  /** The objects the handler can use, for one input. */
  env: (input: AppInput, log: string[]) => Record<string, unknown>;
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

// Every app is built by a factory from a few values, so a challenge variant can
// rename the variables, change the data and push the faulty line down with a
// few harmless lines of its own. The defaults reproduce the guided levels.

/** Lines a variant may add at the top of a handler. They run, and do nothing harmful. */
export const PAD_LINES = ["  audit('request received');", '  const requestId = req.id;', '  const started = now();', "  const source = 'web';", '  const limit = 20;'];

const HELPERS = { audit: () => undefined, now: () => 1793952000 };

/** Wrong-answer texts point at the step on a guided level and stay general in a challenge. */
const say = (challenge: boolean | undefined, guided: string, open: string) => (challenge ? open : guided);

const lines = (pad: string[] | undefined, rest: string) => [...(pad ?? []), ...(rest ? [rest] : [])].join('\n');

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

function loginEnv(o: LoginOptions, input: AppInput, log: string[], extra: Record<string, unknown> = {}) {
  return {
    req: { body: { [o.userField]: input.name ?? '', [o.passField]: input.pass ?? '' }, id: 'r-5512' },
    db: {
      query: (sql: unknown, params?: unknown) => {
        const bound = bind(String(sql), params);
        if (bound.error) throw new Error(bound.error);
        log.push(`SQL  ${redact(bound.sql)}`);
        if (inputEscapedLiteral(bound.sql)) {
          log.push('the input ended the string: the rest of it was read as SQL, and the password check no longer applied');
          return [o.users[0]];
        }
        const r = query(bound.sql, { users: o.users });
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

export interface LoginOptions {
  userField: string;
  passField: string;
  users: Row[];
  /** The recorded attack's input category, and the two others the replay also tries. */
  attack: AppInput;
  variants: AppInput[];
  /** A real customer who signs in during the normal-use check. */
  customer: { name: string; pass: string };
  pad?: string[];
  challenge?: boolean;
}

export const LOGIN_DEFAULT: LoginOptions = {
  userField: 'name',
  passField: 'pass',
  users: USERS,
  attack: { name: MARK.sqlComment, pass: 'anything' },
  variants: [{ name: MARK.sqlAlwaysTrue, pass: 'anything' }, { name: MARK.sqlBreakout, pass: MARK.sqlAlwaysTrue }],
  customer: { name: 'alice', pass: 'tulip-river-42' },
};

export function makeLogin(o: LoginOptions = LOGIN_DEFAULT): ArenaApp {
  const { userField: u, passField: p } = o;
  return {
    id: 'login',
    challenge: o.challenge,
    env: (input, log) => loginEnv(o, input, log),
    code: {
      head: "app.post('/login', (req, res) => {",
      pre: lines(o.pad, `  const { ${u}, ${p} } = req.body;`),
      edit: `  const sql = "SELECT * FROM users WHERE name = '" + ${u} + "' AND pass = '" + ${p} + "'";
  const rows = db.query(sql);`,
      post: `  if (rows.length === 0) return res.status(401).send('Wrong name or password');
  return res.send(welcome(rows[0]));`,
      foot: '});',
      fix: `  const sql = 'SELECT * FROM users WHERE name = ? AND pass = ?';
  const rows = db.query(sql, [${u}, ${p}]);`,
      faultLine: 0,
    },
    attack: o.attack,
    variants: o.variants,
    normal: [o.customer, { name: o.customer.name, pass: 'wrong-guess' }, { name: "O'Brien", pass: 'x' }],
    replay: [
      { who: 'Attacker', text: 'Types a name containing a quote that ends the SQL string early, then comments out the rest of the query. Any password.' },
      { who: 'Server', text: 'Glues the name into the query text. The quote closes the string, so the rest of the name is read as SQL and the password check drops out.' },
      { who: 'Result', text: 'Signed in as admin, with no password.' },
    ],
    blockedText: 'The name arrives as a value, quote and all. No user has that name: 401 Wrong name or password.',
    normalText: `${o.customer.name.charAt(0).toUpperCase() + o.customer.name.slice(1)} signs in with her password; a wrong password is refused; a name with an apostrophe does not break the query.`,
    exploited(input, reply) {
      const who = loggedInAs(reply);
      if (!who) return false;
      const user = o.users.find((x) => x.name === who);
      return !user || user.pass !== input.pass;
    },
    normalOk(input, reply) {
      const user = o.users.find((x) => x.name === input.name);
      const correct = user && user.pass === input.pass;
      if (correct) return loggedInAs(reply) === input.name;
      return reply.status === 401;
    },
    variantReason: say(o.challenge, `Another input of the same kind still changes the query. Use ? placeholders and pass [${u}, ${p}] to db.query, as in the example, and replay.`, 'Another input of the same kind still changes the query. Filtering one input is not enough: the values must reach the database apart from the SQL text.'),
  };
}

/** The developers' first attempt at a fix, for the Report zone's retest: it rejects one category only. */
export function loginWithFilterEnv(input: AppInput, log: string[], mark: string = MARK.sqlComment) {
  return loginEnv(LOGIN_DEFAULT, input, log, {
    looksLikeTheReportedAttack: (s: unknown) => String(s).includes(mark.slice(1)),
  });
}

// ---- 2. Search: input in HTML -------------------------------------------------

export const CATALOGUE = ['Atelier brass desk lamp', 'Brass picture light', 'Quai wall light', 'Bobbin pendant', 'Oak floor lamp'];

function searchEnv(o: SearchOptions, input: AppInput, log: string[]) {
  const q = input.q ?? '';
  const hits = o.catalogue.filter((c) => q.trim() !== '' && c.toLowerCase().includes(q.toLowerCase().trim()));
  log.push(`search "${redact(q)}" -> ${hits.length} result${hits.length === 1 ? '' : 's'}`);
  const encode = (s: unknown) => escapeHtml(s);
  return {
    req: { query: { [o.param]: q }, id: 'r-5512' },
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

export interface SearchOptions {
  /** The query-string name, also the variable the handler keeps it in. */
  param: string;
  route: string;
  heading: string;
  catalogue: string[];
  attack: AppInput;
  variants: AppInput[];
  normal: AppInput[];
  pad?: string[];
  challenge?: boolean;
}

export const SEARCH_DEFAULT: SearchOptions = {
  param: 'q',
  route: '/search',
  heading: 'Results for',
  catalogue: CATALOGUE,
  attack: { q: MARK.markup },
  variants: [{ q: MARK.markupAttr }],
  normal: [{ q: 'brass' }, { q: 'Tom & Jo\'s "lamp"' }],
};

export function makeSearch(o: SearchOptions = SEARCH_DEFAULT): ArenaApp {
  const q = o.param;
  return {
    id: 'search',
    challenge: o.challenge,
    env: (input, log) => searchEnv(o, input, log),
    code: {
      head: `app.get('${o.route}', (req, res) => {`,
      pre: lines(o.pad, `  const ${q} = req.query.${q} ?? '';\n  const hits = catalogue.search(${q});`),
      edit: `  return res.send('<h2>${o.heading} ' + ${q} + '</h2>' + list(hits));`,
      post: '',
      foot: '});\n// helpers you can use: escapeHtml(text)',
      fix: `  return res.send('<h2>${o.heading} ' + escapeHtml(${q}) + '</h2>' + list(hits));`,
      faultLine: 0,
    },
    attack: o.attack,
    variants: o.variants,
    normal: o.normal,
    replay: [
      { who: 'Attacker', text: 'Sends a customer a search link whose search words contain markup.' },
      { who: 'Server', text: 'Pastes the search words into the results page as HTML, not as text.' },
      { who: 'Result', text: "The customer's browser treats the attacker's words as part of the page, so it would run the attacker's script with the customer's session." },
    ],
    blockedText: 'The search words are encoded for HTML: the page shows them as text and nothing runs.',
    normalText: o === SEARCH_DEFAULT ? 'A search for brass lists the brass lamps, and a search with an ampersand and quotes shows them as typed.' : `A search for ${o.normal[0]?.q ?? 'a lamp'} lists what matches, and a search with an ampersand and quotes shows them as typed.`,
    exploited: (_i, reply) => typeof reply.body === 'string' && markupInPage(reply.body),
    normalOk(input, reply) {
      if (reply.status !== 200 || typeof reply.body !== 'string') return false;
      return pageText(reply.body).includes(`${o.heading} ${(input.q ?? '').trim()}`) && !markupInPage(reply.body);
    },
    variantReason: say(o.challenge, `Another kind of markup still reaches the page. Wrap the whole ${q} in escapeHtml(${q}), as in the example, and replay.`, 'Another kind of markup still reaches the page. Removing one pattern is not enough: encode every character that means something in HTML.'),
  };
}

// ---- 3. Invoices: an id nobody checks ------------------------------------------

export interface Invoice {
  id: number;
  ownerId: string;
  customer: string;
  total: string;
  items: string;
}

export const INVOICES: Record<string, Invoice> = {
  '1041': { id: 1041, ownerId: 'u-17', customer: 'Mara Okafor', total: '1,260.00 EUR', items: '6 x Quai wall light' },
  '1042': { id: 1042, ownerId: 'u-17', customer: 'Mara Okafor', total: '420.00 EUR', items: '2 x Bobbin pendant' },
  '1043': { id: 1043, ownerId: 'u-23', customer: 'Sam Weller', total: '189.00 EUR', items: '1 x Atelier desk lamp' },
  '1044': { id: 1044, ownerId: 'u-31', customer: 'Atelier Rive SARL', total: '3,780.00 EUR', items: '20 x Atelier desk lamp' },
  '1048': { id: 1048, ownerId: 'u-23', customer: 'Sam Weller', total: '145.00 EUR', items: '1 x Quai wall light' },
};

export interface InvoiceOptions {
  /** The collection (invoices, orders...) and the variable one record is kept in. */
  resource: string;
  one: string;
  me: { id: string; name: string };
  records: Record<string, Invoice>;
  attackId: string;
  variantIds: string[];
  ownId: string;
  missingId: string;
  pad?: string[];
  challenge?: boolean;
}

export const INVOICE_DEFAULT: InvoiceOptions = {
  resource: 'invoices',
  one: 'invoice',
  me: { id: 'u-23', name: 'sam' },
  records: INVOICES,
  attackId: '1042',
  variantIds: ['1044', '1041'],
  ownId: '1043',
  missingId: '9999',
};

export function makeInvoices(o: InvoiceOptions = INVOICE_DEFAULT): ArenaApp {
  const v = o.one;
  const victim = o.records[o.attackId];
  const display = o.me.name.charAt(0).toUpperCase() + o.me.name.slice(1);
  return {
    id: 'invoices',
    challenge: o.challenge,
    env: (input, log) => ({
      req: { params: { id: input.id ?? '' }, user: { ...o.me }, id: 'r-5512' },
      db: {
        [o.resource]: {
          find: (id: unknown) => {
            const inv = o.records[String(id)];
            log.push(`db.${o.resource}.find(${String(id)}) -> ${inv ? `${o.one} of ${inv.ownerId}` : 'nothing'}`);
            return inv ? { ...inv } : undefined;
          },
        },
      },
    }),
    code: {
      head: `app.get('/api/${o.resource}/:id', requireLogin, (req, res) => {`,
      pre: lines(o.pad, `  const ${v} = db.${o.resource}.find(req.params.id);`),
      edit: `  if (!${v}) return res.status(404).json({ error: 'Not found' });
  return res.json(${v});`,
      post: '',
      foot: `});\n// req.user is the signed-in user: { id: '${o.me.id}', name: '${o.me.name}' }`,
      fix: `  if (!${v} || ${v}.ownerId !== req.user.id) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json(${v});`,
      faultLine: 1,
    },
    attack: { id: o.attackId },
    variants: o.variantIds.map((id) => ({ id })),
    normal: [{ id: o.ownId }, { id: o.missingId }],
    replay: [
      { who: 'Attacker', text: `Signs in as an ordinary customer and asks for ${o.one} ${o.attackId} instead of their own ${o.ownId}.` },
      { who: 'Server', text: `Finds ${o.one} ${o.attackId} and returns it. It checked that someone was signed in, not whose ${o.one} it was.` },
      { who: 'Result', text: `${victim?.customer ?? 'Another customer'}'s ${o.one}, address and total, in a stranger's browser.` },
    ],
    blockedText: `${o.one.charAt(0).toUpperCase() + o.one.slice(1)} ${o.attackId} belongs to someone else: the server answers 404, as if it did not exist.`,
    normalText: `${display} still opens his own ${o.one} ${o.ownId}, and a missing ${o.one} is still a 404.`,
    exploited(_i, reply) {
      const b = reply.body as { ownerId?: string } | null;
      return reply.status === 200 && !!b && typeof b === 'object' && b.ownerId !== o.me.id;
    },
    normalOk(input, reply) {
      const b = reply.body as { id?: number } | null;
      if (input.id === o.missingId) return reply.status === 404 || reply.status === 403;
      return reply.status === 200 && !!b && b.id === Number(input.id);
    },
    variantReason: say(o.challenge, `Another customer's ${o.one} still opens. Answer 404 whenever ${v}.ownerId !== req.user.id, as in the example, and replay.`, `Another customer's ${o.one} still opens. Checking one id is not enough: compare every record's owner with the signed-in user.`),
  };
}

// ---- 4. Ping: input in a shell command line -------------------------------------

function pingOutput(host: string): string {
  const known: Record<string, string> = { '9.9.9.9': '9.9.9.9', 'harbor.example': '203.0.113.10' };
  const ip = known[host] ?? (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? host : null);
  if (!ip) return `ping: ${redact(host)}: Name or service not known`;
  return `PING ${host} (${ip}) 56(84) bytes of data.\n64 bytes from ${ip}: icmp_seq=1 ttl=57 time=11.8 ms\n\n--- ${host} ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss`;
}

export const SECOND_COMMAND = '[a second command ran on the server as www-data]';

export interface PingOptions {
  /** The variable the host is kept in, the -c count, and a host a normal user pings. */
  name: string;
  count: string;
  normalHost: string;
  attack: AppInput;
  variants: AppInput[];
  pad?: string[];
  challenge?: boolean;
}

export const PING_DEFAULT: PingOptions = {
  name: 'host',
  count: '1',
  normalHost: '9.9.9.9',
  attack: { host: `9.9.9.9 ${MARK.shellChain}` },
  variants: [{ host: MARK.shellSubst }],
};

export function makePing(o: PingOptions = PING_DEFAULT): ArenaApp {
  const h = o.name;
  return {
    id: 'ping',
    challenge: o.challenge,
    env: (input, log) => ({
      req: { body: { host: input.host ?? '' }, id: 'r-5512' },
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
    }),
    code: {
      head: "app.post('/tools/ping', requireStaff, (req, res) => {",
      pre: lines(o.pad, `  const ${h} = req.body.host;`),
      edit: `  const output = exec('ping -c ${o.count} ' + ${h});
  return res.send(output);`,
      post: '',
      foot: '});\n// available: exec(commandLine), execFile(program, [args])',
      fix: `  const output = execFile('ping', ['-c', '${o.count}', ${h}]);
  return res.send(output);`,
      faultLine: 0,
    },
    attack: o.attack,
    variants: o.variants,
    normal: [{ host: o.normalHost }],
    replay: [
      { who: 'Attacker', text: 'Enters a host followed by a shell separator and a second command.' },
      { who: 'Server', text: 'Builds one command line and hands it to the shell, which reads the separator as its own syntax.' },
      { who: 'Result', text: 'The ping runs, and then the second command runs on the server as www-data.' },
    ],
    blockedText: 'The host goes to ping as one argument. Ping cannot resolve it, and nothing else runs.',
    normalText: `Pinging ${o.normalHost} still works.`,
    exploited: (_i, reply) => typeof reply.body === 'string' && reply.body.includes(SECOND_COMMAND),
    normalOk: (_i, reply) => reply.status === 200 && typeof reply.body === 'string' && reply.body.includes('1 received'),
    variantReason: say(o.challenge, `Another shell trick still runs a second command. Use execFile('ping', ['-c', '${o.count}', ${h}]) instead of exec, as in the example, and replay.`, 'Another shell trick still runs a second command. Blocking one character is not enough: take the shell out of the path.'),
  };
}

// ---- 5. Link previews: the server fetches what you ask -----------------------------

/** Public sites the preview can reach, and the title of the article each one serves. */
export const PUBLIC_SITES: Record<string, { title: string; text: string }> = {
  'news.example': { title: 'Lyon lamp makers reopen the old foundry', text: 'A short walk from the river, the foundry lights up again.' },
  'blog.example': { title: 'How we polish brass', text: 'Three cloths and patience.' },
  'press.example': { title: 'The quiet return of brass lighting', text: 'Designers are going back to metal.' },
  'wiki.example': { title: 'Lantern (lighting)', text: 'A portable source of light, usually with a protective case.' },
  'docs.example': { title: 'Care guide for brass fittings', text: 'Dust weekly, polish twice a year.' },
};

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
  const site = PUBLIC_SITES[host];
  if (site) return { status: 200, ...site, internal: false };
  return { status: 502, title: 'Could not reach that site', text: '', internal: false };
}

export interface PreviewOptions {
  allowed: string[];
  /** The variable the parsed URL is kept in. */
  name: string;
  attack: AppInput;
  variants: AppInput[];
  normalUrl: string;
  pad?: string[];
  challenge?: boolean;
}

export const PREVIEW_DEFAULT: PreviewOptions = {
  allowed: ['news.example', 'blog.example'],
  name: 'target',
  attack: { url: 'http://169.254.169.254/latest/meta-data/' },
  variants: [{ url: 'http://localhost:8080/' }, { url: 'http://169.254.169.254.nip.io/' }, { url: 'http://[::1]/' }],
  normalUrl: 'https://news.example/2026/11/foundry',
};

export function makePreview(o: PreviewOptions = PREVIEW_DEFAULT): ArenaApp {
  const t = o.name;
  const normalHost = new URL(o.normalUrl).hostname;
  return {
    id: 'preview',
    challenge: o.challenge,
    env: (input, log) => ({
      req: { body: { url: input.url ?? '' }, id: 'r-5512' },
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
    }),
    code: {
      head: "app.post('/preview', requireLogin, (req, res) => {",
      pre: lines(o.pad, `  const ALLOWED_HOSTS = [${o.allowed.map((h) => `'${h}'`).join(', ')}];\n  const ${t} = new URL(req.body.url);`),
      edit: `  const page = fetchPage(${t}.href);
  return res.json(preview(page));`,
      post: '',
      foot: '});',
      fix: `  if (!ALLOWED_HOSTS.includes(${t}.hostname)) {
    return res.status(400).json({ error: 'That site is not allowed' });
  }
  const page = fetchPage(${t}.href);
  return res.json(preview(page));`,
      faultLine: 0,
    },
    attack: o.attack,
    variants: o.variants,
    normal: [{ url: o.normalUrl }],
    replay: [
      { who: 'Attacker', text: o === PREVIEW_DEFAULT ? "Asks for a preview of a link that points at the cloud's internal metadata address." : "Asks for a preview of a link that points at an address inside the server's own network." },
      { who: 'Server', text: 'Fetches the link from inside its own network, where that address answers.' },
      { who: 'Result', text: o === PREVIEW_DEFAULT ? "The preview card shows the server's temporary cloud credentials." : "The preview card shows something only the inside of the network should see." },
    ],
    blockedText: 'The link is not on the allow-list: 400, nothing is fetched.',
    normalText: `A preview of a ${normalHost} article still works.`,
    exploited: (input, reply) => reply.status === 200 && fetchPage(input.url ?? '').internal,
    normalOk(input, reply) {
      const b = reply.body as { title?: string } | null;
      const want = PUBLIC_SITES[new URL(input.url ?? o.normalUrl).hostname]?.title;
      return reply.status === 200 && !!b && typeof b.title === 'string' && b.title === want;
    },
    variantReason: say(o.challenge, `Another internal address still gets through. Instead of blocking addresses, answer 400 unless ALLOWED_HOSTS.includes(${t}.hostname), as in the example, and replay.`, 'Another internal address still gets through. A list of banned addresses always misses one: allow only the sites you trust.'),
  };
}

// ---- 6. Sign-up: the whole body saved as a record ------------------------------------

/** What a new account gets unless someone says otherwise. Any of these changing is the attack working. */
export const ACCOUNT_DEFAULTS: Record<string, unknown> = { role: 'customer', credits: 0, verified: false };

export interface SignupOptions {
  /** The fields a user may set, the defaults a new record gets, and the attack's extra field. */
  fields: string[];
  defaults: Record<string, unknown>;
  attack: AppInput;
  variants: AppInput[];
  normal: AppInput;
  pad?: string[];
  challenge?: boolean;
}

export const SIGNUP_DEFAULT: SignupOptions = {
  fields: ['name', 'email'],
  defaults: ACCOUNT_DEFAULTS,
  attack: { body: '{"name":"sam","email":"sam@mail.example","role":"admin"}' },
  variants: [{ body: '{"name":"sam","email":"sam@mail.example","credits":5000}' }, { body: '{"name":"sam","email":"sam@mail.example","verified":true}' }],
  normal: { body: '{"name":"Ines","email":"ines@mail.example"}' },
};

export function makeSignup(o: SignupOptions = SIGNUP_DEFAULT): ArenaApp {
  const list = o.fields.join(', ');
  const describe = Object.entries(o.defaults)
    .map(([k, v]) => (typeof v === 'string' ? `${k} "${v}"` : `${k} ${String(v)}`))
    .join(', ');
  const isDefault = o === SIGNUP_DEFAULT;
  const extra = Object.keys(JSON.parse(o.attack.body ?? '{}') as object).find((k) => !o.fields.includes(k)) ?? 'role';
  return {
    id: 'signup',
    challenge: o.challenge,
    env: (input, log) => {
      let body: unknown;
      try {
        body = JSON.parse(input.body ?? '{}');
      } catch {
        body = null;
      }
      return {
        req: { body, id: 'r-5512' },
        db: {
          users: {
            create: (fields: unknown) => {
              const f = (fields && typeof fields === 'object' ? fields : {}) as Record<string, unknown>;
              const record = { id: 'u-58', ...o.defaults, ...f };
              log.push(`INSERT users ${JSON.stringify(record)}`);
              return record;
            },
          },
        },
        pick: (obj: unknown, keys: unknown) => {
          const src = (obj && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
          const out: Record<string, unknown> = {};
          for (const k of Array.isArray(keys) ? keys : []) if (Object.prototype.hasOwnProperty.call(src, String(k))) out[String(k)] = src[String(k)];
          return out;
        },
      };
    },
    code: {
      head: "app.post('/api/signup', (req, res) => {",
      pre: lines(o.pad, ''),
      edit: `  const user = db.users.create(req.body);
  return res.status(201).json(user);`,
      post: '',
      foot: isDefault ? '});\n// new users get role "customer", 0 credits, verified false' : `});\n// new users get ${describe}`,
      fix: `  const { ${list} } = req.body;
  const user = db.users.create({ ${list} });
  return res.status(201).json(user);`,
      faultLine: 0,
    },
    attack: o.attack,
    variants: o.variants,
    normal: [o.normal],
    replay: [
      { who: 'Attacker', text: isDefault ? 'Signs up with the usual name and email, plus one extra field the form never shows: a role.' : `Signs up with the usual fields, plus one extra field the form never shows: ${extra}.` },
      { who: 'Server', text: 'Saves the whole request body as the new user record.' },
      { who: 'Result', text: isDefault ? 'A brand-new account with role admin.' : `A brand-new account with ${extra} set by the attacker.` },
    ],
    blockedText: isDefault ? 'Only name and email are copied: the extra field is ignored and the account is a customer.' : `Only ${o.fields.join(' and ')} are copied: the extra field is ignored and the account gets the defaults.`,
    normalText: isDefault ? 'Ines signs up with a name and an email and gets an ordinary customer account.' : `${String((JSON.parse(o.normal.body ?? '{}') as Record<string, unknown>).name ?? 'A new user')} signs up and gets an ordinary customer account.`,
    exploited(_i, reply) {
      const u = reply.body as Record<string, unknown> | null;
      return reply.status < 300 && !!u && typeof u === 'object' && Object.entries(o.defaults).some(([k, v]) => u[k] !== v);
    },
    normalOk(input, reply) {
      const u = reply.body as Record<string, unknown> | null;
      const sent = JSON.parse(input.body ?? '{}') as Record<string, unknown>;
      return reply.status === 201 && !!u && o.fields.every((f) => u[f] === sent[f]) && Object.entries(o.defaults).every(([k, v]) => u[k] === v);
    },
    variantReason: say(o.challenge, `Another extra field still goes straight into the database. Pull out only ${list} and create the user from those, as in the example, and replay.`, 'Another extra field still goes straight into the database. Removing one field is not enough: copy only the fields a user may set.'),
  };
}

export const ARENA_APPS: Record<ArenaAppId, ArenaApp> = {
  login: makeLogin(),
  search: makeSearch(),
  invoices: makeInvoices(),
  ping: makePing(),
  preview: makePreview(),
  signup: makeSignup(),
};

const appOf = (a: ArenaApp | ArenaAppId): ArenaApp => (typeof a === 'string' ? ARENA_APPS[a] : a);

/** Run an app's handler with some code (the original or the player's) on one input. */
export function runApp(which: ArenaApp | ArenaAppId, edit: string, input: AppInput, envOverride?: (input: AppInput, log: string[]) => Record<string, unknown>): Reply {
  const app = appOf(which);
  const log: string[] = [];
  const code = assemble(app, edit);
  const off = app.code.pre.trim() ? app.code.pre.split('\n').length : 0;
  const n = edit.split('\n').length;
  if (app.id === 'signup') {
    try {
      JSON.parse(input.body ?? '');
    } catch {
      return { status: 400, body: 'Body is not valid JSON', log: ['request rejected: invalid JSON'] };
    }
  }
  const reply = handle(code, { ...HELPERS, ...(envOverride ?? app.env)(input, log) }, log, off, n);
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
export function testFix(which: ArenaApp | ArenaAppId, edit: string): FixReport {
  const app = appOf(which);
  const c = app.challenge;
  const atk = runApp(app, edit, app.attack);
  if (atk.error) return { error: atk.error, attackBlocked: false, variantsBlocked: false, normalWorks: false, reason: `${atk.error} ${say(c, 'Fix that in the code box, comparing it with the example in the step, and press Replay attack again.', 'Fix that in the code box and press Replay attack again.')}` };
  const attackBlocked = !atk.harmed;
  const variantsBlocked = app.variants.every((v) => !runApp(app, edit, v).harmed);
  let normalWorks = true;
  let normalError = '';
  for (const n of app.normal) {
    const r = runApp(app, edit, n);
    if (r.error) normalError = r.error;
    if (!app.normalOk(n, r)) {
      normalWorks = false;
      break;
    }
  }
  const reason = !attackBlocked
    ? say(c, 'The recorded attack still works against this code. Change the code box to match the example in the step, then press Replay attack again.', 'The recorded attack still works against this code. Change how the input is used on the faulty line, then replay.')
    : !variantsBlocked
      ? app.variantReason
      : !normalWorks
        ? `${normalError ? normalError + ' ' : ''}${say(c, 'The attack is stopped but normal use broke. Keep the rest of the code as it was, change only what the step says, and replay.', 'The attack is stopped but normal use broke. Keep what the handler does for honest users, and replay.')}`
        : '';
  return { attackBlocked, variantsBlocked, normalWorks, reason };
}

/** The full listing the player reads, and the line number (1-based) of the faulty line in it. */
export function listing(app: ArenaApp, edit: string): { lines: { text: string; region: 'head' | 'pre' | 'edit' | 'post' | 'foot' }[]; fault: number } {
  const out: { text: string; region: 'head' | 'pre' | 'edit' | 'post' | 'foot' }[] = [];
  const push = (text: string, region: 'head' | 'pre' | 'edit' | 'post' | 'foot') => {
    if (!text.trim()) return;
    for (const t of text.split('\n')) out.push({ text: t, region });
  };
  push(app.code.head, 'head');
  push(app.code.pre, 'pre');
  const editStart = out.length;
  push(edit, 'edit');
  push(app.code.post, 'post');
  push(app.code.foot, 'foot');
  return { lines: out, fault: editStart + app.code.faultLine + 1 };
}
