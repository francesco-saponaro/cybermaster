// The simulated servers behind The Wire. Each one takes a parsed request and
// answers the way a small, slightly careless web app would.

import { type HttpRequest, type HttpResponse, type PageView, header, signHs256, verifyJwt, corsAllowsRead, parseSetCookie } from './http';

export type WireServerId = 'shop' | 'role-cookie' | 'replay' | 'httponly' | 'jwt' | 'cors';

const HTML = ['Content-Type', 'text/html; charset=utf-8'] as [string, string];
const TEXT = ['Content-Type', 'text/plain; charset=utf-8'] as [string, string];
const JSONT = ['Content-Type', 'application/json'] as [string, string];

function page(status: number, view: PageView, extra: [string, string][] = []): HttpResponse {
  return { status, headers: [['Server', 'nginx'], HTML, ...extra], body: viewToText(view), view };
}

function json(status: number, data: unknown, extra: [string, string][] = []): HttpResponse {
  return { status, headers: [['Server', 'nginx'], JSONT, ...extra], body: JSON.stringify(data, null, 2) };
}

function text(status: number, body: string): HttpResponse {
  return { status, headers: [['Server', 'nginx'], TEXT], body };
}

function notFound(req: HttpRequest): HttpResponse {
  return page(404, { title: 'Not found', blocks: [{ t: 'h', text: 'Not found' }, { t: 'p', text: `Nothing lives at ${req.path}.` }] });
}

/** A readable body for the raw response pane, built from the same view the browser draws. */
function viewToText(view: PageView): string {
  const out: string[] = [`<title>${view.title}</title>`];
  for (const b of view.blocks) {
    if (b.t === 'h') out.push(`<h1>${b.text}</h1>`);
    else if (b.t === 'p') out.push(`<p>${b.text}</p>`);
    else if (b.t === 'alert') out.push(`<div class="${b.tone}">${b.text}</div>`);
    else if (b.t === 'list') out.push('<ul>' + b.items.map((i) => `<li>${i}</li>`).join('') + '</ul>');
    else if (b.t === 'kv') out.push('<dl>' + b.rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '</dl>');
    else out.push(`<pre>${b.text}</pre>`);
  }
  return out.join('\n');
}

// Each server is built from a few values, so a challenge variant can move the
// hidden page, rename the cookie or change who holds which session. The
// defaults are the guided levels' values.

// ---- Level 1: a shop with a page it forgot to hide -------------------------

export interface ShopParams {
  brand: string;
  tagline: string;
  items: string[];
  /** The page robots.txt gives away, and what is on it. */
  hidden: string;
  notes: string[];
  /** Other Disallow lines in robots.txt. Paths in `missing` answer 404. */
  disallow: string[];
  missing: string[];
}

export const SHOP_DEFAULT: ShopParams = {
  brand: 'Lantern & Co.',
  tagline: 'Brass desk lamps, made in Lyon since 1987.',
  items: ['Atelier desk lamp, 189 EUR', 'Quai wall light, 145 EUR', 'Bobbin pendant, 210 EUR'],
  hidden: '/staff-notes',
  notes: ['Winter sale code: LUMEN25 (not live until 1 Dec)', 'Supplier invoices are in /staff-notes/invoices', 'Old admin login still on /admin-old'],
  disallow: ['/cart', '/staff-notes'],
  missing: [],
};

function shop(p: ShopParams) {
  return (req: HttpRequest): HttpResponse => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Method Not Allowed');
    if (req.path === '/' || req.path === '/index.html') {
      return page(200, { title: p.brand, blocks: [{ t: 'h', text: p.brand }, { t: 'p', text: p.tagline }, { t: 'list', items: p.items }] });
    }
    if (req.path === '/robots.txt') return text(200, 'User-agent: *\n' + p.disallow.map((d) => `Disallow: ${d}`).join('\n') + '\n');
    if (req.path === p.hidden) {
      return page(200, {
        title: 'Staff notes',
        blocks: [{ t: 'h', text: 'Staff notes (internal)' }, { t: 'alert', tone: 'bad', text: 'Not linked from anywhere, so nobody will find it. - Theo' }, { t: 'list', items: p.notes }],
      });
    }
    if (req.path === '/cart' && !p.missing.includes('/cart')) return page(200, { title: 'Cart', blocks: [{ t: 'h', text: 'Your cart' }, { t: 'p', text: 'Your cart is empty.' }] });
    return notFound(req);
  };
}

// ---- Level 2: a role kept in a cookie --------------------------------------

export interface RoleParams {
  session: string;
  /** The cookie that carries the role, its value for a customer and the one the server treats as admin. */
  cookie: string;
  userValue: string;
  adminValue: string;
  user: string;
}

export const ROLE_DEFAULT: RoleParams = { session: 'b81c4e2a90f7', cookie: 'role', userValue: 'user', adminValue: 'admin', user: 'sam' };

function roleCookie(p: RoleParams) {
  const display = p.user.charAt(0).toUpperCase() + p.user.slice(1);
  return (req: HttpRequest): HttpResponse => {
    if (req.path !== '/account') return req.path === '/' ? page(200, { title: 'Lantern & Co.', blocks: [{ t: 'h', text: 'Lantern & Co.' }, { t: 'p', text: 'Go to /account to see your orders.' }] }) : notFound(req);
    if (req.cookies.session !== p.session) {
      return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Please sign in' }, { t: 'p', text: 'No valid session cookie was sent.' }] });
    }
    const role = (req.cookies[p.cookie] ?? '').toLowerCase();
    if (role === p.adminValue.toLowerCase()) {
      return page(200, {
        title: 'Admin',
        blocks: [
          { t: 'h', text: 'Admin panel' },
          { t: 'alert', tone: 'bad', text: `Signed in as ${p.user}, with ${p.cookie} ${p.adminValue}.` },
          { t: 'kv', rows: [['Customers', '1,204'], ['Orders this month', '318'], ['Refunds waiting', '7']] },
          { t: 'list', items: ['Export every customer', 'Issue a refund', 'Edit prices'] },
        ],
      });
    }
    return page(200, {
      title: 'Your account',
      blocks: [
        { t: 'h', text: `Hello, ${display}` },
        { t: 'p', text: p.cookie === 'role' ? `Signed in as ${p.user}, with role ${role || '(none)'}.` : `Signed in as ${p.user}, with ${p.cookie} ${role || '(none)'}. Staff see the admin panel here.` },
        { t: 'list', items: ['Order 5521: Atelier desk lamp, shipped', 'Order 5490: Bobbin pendant, delivered'] },
      ],
    });
  };
}

// ---- Level 3: a session cookie that anyone can replay -----------------------

export interface ReplayParams {
  /** Session id -> the user it belongs to and what their account shows. Expired ids answer 401. */
  sessions: Record<string, { user: string; lines: string[] }>;
  expired: string[];
}

export const SESSIONS: Record<string, string> = {
  'sid-4f19a2c7e0': 'sam',
  'sid-9be03d71c4': 'mara',
};

export const REPLAY_DEFAULT: ReplayParams = {
  sessions: {
    'sid-4f19a2c7e0': { user: 'sam', lines: ['Order 5521: Atelier desk lamp, shipped'] },
    'sid-9be03d71c4': { user: 'mara', lines: ['Order 5530: Quai wall light x2, paid with card ending 4417', 'Delivery address: 14 rue des Tanneurs, Lyon'] },
  },
  expired: [],
};

function replay(p: ReplayParams) {
  return (req: HttpRequest): HttpResponse => {
    if (req.path !== '/account') return notFound(req);
    const sid = req.cookies.sid ?? '';
    if (p.expired.includes(sid)) return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Session expired' }, { t: 'p', text: 'That session was signed out. Please sign in again.' }] });
    const s = p.sessions[sid];
    if (!s) return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Please sign in' }, { t: 'p', text: 'That session id is not one the server issued.' }] });
    return page(200, {
      title: 'Your account',
      blocks: [{ t: 'h', text: `Hello, ${s.user.charAt(0).toUpperCase() + s.user.slice(1)}` }, { t: 'p', text: `Signed in as ${s.user}.` }, { t: 'list', items: s.lines }],
    });
  };
}

// ---- Level 4: a login that sets a cookie scripts can read -------------------

export interface HttpOnlyParams {
  cookie: string;
  value: string;
  user: string;
}

export const HTTPONLY_DEFAULT: HttpOnlyParams = { cookie: 'session', value: 'e5d1f0a7c3b9', user: 'Sam' };

function httponly(p: HttpOnlyParams) {
  return (req: HttpRequest): HttpResponse => {
    if (req.path === '/login' && req.method === 'POST') {
      return page(200, { title: 'Welcome', blocks: [{ t: 'h', text: `Welcome back, ${p.user}` }, { t: 'p', text: 'You are signed in.' }] }, [['Set-Cookie', `${p.cookie}=${p.value}; Path=/`]]);
    }
    if (req.path === '/account') {
      if (req.cookies[p.cookie] === p.value) return page(200, { title: 'Account', blocks: [{ t: 'h', text: `Hello, ${p.user}` }, { t: 'p', text: 'Still signed in: the browser sent the session cookie.' }] });
      return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Please sign in' }] });
    }
    return notFound(req);
  };
}

// ---- Level 5: JWTs, one server trusting the token's own algorithm ---------

export interface JwtParams {
  secret: string;
  /** The old API trusts the token's alg header; the new one pins HS256. */
  oldVer: string;
  newVer: string;
  /** The payload field the API reads the role from. */
  claim: string;
}

export const JWT_SECRET = 'lantern-signing-key-2026';
export const SAM_HEADER = '{"alg":"HS256","typ":"JWT"}';
export const SAM_PAYLOAD = '{"sub":"sam","role":"user","iat":1793952000}';
export const SAM_TOKEN = signHs256(SAM_HEADER, SAM_PAYLOAD, JWT_SECRET);
export const JWT_DEFAULT: JwtParams = { secret: JWT_SECRET, oldVer: 'v1', newVer: 'v2', claim: 'role' };

function jwt(p: JwtParams) {
  const re = new RegExp(`^/(${p.oldVer}|${p.newVer})/(me|admin)$`);
  return (req: HttpRequest): HttpResponse => {
    const m = re.exec(req.path);
    if (!m) return notFound(req);
    const [, version, what] = m;
    const auth = header(req.headers, 'authorization') ?? '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Missing Authorization: Bearer token' });
    const verdict = verifyJwt(token, p.secret, version === p.oldVer);
    if (!verdict.ok) return json(401, { error: verdict.reason });
    const sub = String(verdict.payload.sub ?? '');
    const role = String(verdict.payload[p.claim] ?? '');
    if (what === 'me') return json(200, { user: sub, [p.claim]: role });
    if (role !== 'admin') return json(403, { error: `${p.claim === 'role' ? 'Role' : p.claim} ${role || '(none)'} may not open the admin API.` });
    return json(200, { admin: true, user: sub, customers: 1204, exportUrl: `/${version}/admin/export.csv` });
  };
}

// ---- Boss: an API that answers any origin -----------------------------------

export interface CorsParams {
  /** The one origin that may read the API, and the attacker's page. */
  trusted: string;
  evil: string;
  path: string;
  cookie: string;
  value: string;
  owner: string;
  iban: string;
  balance: string;
}

export const CORS_DEFAULT: CorsParams = {
  trusted: 'https://bank.example',
  evil: 'https://evil.example',
  path: '/api/account',
  cookie: 'sid',
  value: 'c09e4471ab2f',
  owner: 'Sam Weller',
  iban: 'FR76 3000 6000 0112 3456 7890 189',
  balance: '2,418.50 EUR',
};

function cors(p: CorsParams) {
  return (req: HttpRequest): HttpResponse => {
    if (req.path !== p.path) return notFound(req);
    return {
      status: 200,
      headers: [
        ['Server', 'nginx'],
        JSONT,
        // {origin} is how the config says "copy whatever Origin the request sent"
        ['Access-Control-Allow-Origin', '{origin}'],
        ['Access-Control-Allow-Credentials', 'true'],
        ['Set-Cookie', `${p.cookie}=${p.value}; Path=/`],
      ],
      body: JSON.stringify({ owner: p.owner, iban: p.iban, balance: p.balance }, null, 2),
    };
  };
}

export interface WireParams {
  shop?: ShopParams;
  role?: RoleParams;
  replay?: ReplayParams;
  httponly?: HttpOnlyParams;
  jwt?: JwtParams;
  cors?: CorsParams;
}

/** The server for a level, built from its values (or the guided defaults). */
export function makeServer(id: WireServerId, params?: WireParams): (req: HttpRequest) => HttpResponse {
  switch (id) {
    case 'shop':
      return shop(params?.shop ?? SHOP_DEFAULT);
    case 'role-cookie':
      return roleCookie(params?.role ?? ROLE_DEFAULT);
    case 'replay':
      return replay(params?.replay ?? REPLAY_DEFAULT);
    case 'httponly':
      return httponly(params?.httponly ?? HTTPONLY_DEFAULT);
    case 'jwt':
      return jwt(params?.jwt ?? JWT_DEFAULT);
    case 'cors':
      return cors(params?.cors ?? CORS_DEFAULT);
  }
}

export const SERVERS: Record<WireServerId, (req: HttpRequest) => HttpResponse> = {
  shop: makeServer('shop'),
  'role-cookie': makeServer('role-cookie'),
  replay: makeServer('replay'),
  httponly: makeServer('httponly'),
  jwt: makeServer('jwt'),
  cors: makeServer('cors'),
};

/** The boss's verdicts: what each origin can read, and how the session cookie is flagged. */
export interface CorsReport {
  evil: { allowed: boolean; reason: string };
  bank: { allowed: boolean; reason: string };
  cookie: { httpOnly: boolean; secure: boolean; sameSite: string } | null;
  hsts: boolean;
}

export function corsReport(headers: [string, string][], trusted = CORS_DEFAULT.trusted, evil = CORS_DEFAULT.evil, cookie = CORS_DEFAULT.cookie): CorsReport {
  const forOrigin = (origin: string): [string, string][] => headers.map(([k, v]) => [k, v.replace(/\{origin\}/g, origin)]);
  const setCookie = headers.find(([k, v]) => k.toLowerCase() === 'set-cookie' && v.startsWith(cookie + '='))?.[1] ?? header(headers, 'set-cookie');
  const c = setCookie ? parseSetCookie(setCookie) : null;
  const hsts = header(headers, 'strict-transport-security') ?? '';
  return {
    evil: corsAllowsRead(forOrigin(evil), evil, true),
    bank: corsAllowsRead(forOrigin(trusted), trusted, true),
    cookie: c ? { httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite } : null,
    hsts: /max-age=\s*[1-9]\d*/i.test(hsts),
  };
}
