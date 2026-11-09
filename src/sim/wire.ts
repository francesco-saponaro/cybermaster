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

// ---- Level 1: a shop with a page it forgot to hide -------------------------

function shop(req: HttpRequest): HttpResponse {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Method Not Allowed');
  switch (req.path) {
    case '/':
    case '/index.html':
      return page(200, {
        title: 'Lantern & Co.',
        blocks: [
          { t: 'h', text: 'Lantern & Co.' },
          { t: 'p', text: 'Brass desk lamps, made in Lyon since 1987.' },
          { t: 'list', items: ['Atelier desk lamp, 189 EUR', 'Quai wall light, 145 EUR', 'Bobbin pendant, 210 EUR'] },
        ],
      });
    case '/robots.txt':
      return text(200, 'User-agent: *\nDisallow: /cart\nDisallow: /staff-notes\n');
    case '/staff-notes':
      return page(200, {
        title: 'Staff notes',
        blocks: [
          { t: 'h', text: 'Staff notes (internal)' },
          { t: 'alert', tone: 'bad', text: 'Not linked from anywhere, so nobody will find it. - Theo' },
          { t: 'list', items: ['Winter sale code: LUMEN25 (not live until 1 Dec)', 'Supplier invoices are in /staff-notes/invoices', 'Old admin login still on /admin-old'] },
        ],
      });
    case '/cart':
      return page(200, { title: 'Cart', blocks: [{ t: 'h', text: 'Your cart' }, { t: 'p', text: 'Your cart is empty.' }] });
    default:
      return notFound(req);
  }
}

// ---- Level 2: a role kept in a cookie --------------------------------------

function roleCookie(req: HttpRequest): HttpResponse {
  if (req.path !== '/account') return req.path === '/' ? page(200, { title: 'Lantern & Co.', blocks: [{ t: 'h', text: 'Lantern & Co.' }, { t: 'p', text: 'Go to /account to see your orders.' }] }) : notFound(req);
  if (req.cookies.session !== 'b81c4e2a90f7') {
    return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Please sign in' }, { t: 'p', text: 'No valid session cookie was sent.' }] });
  }
  const role = (req.cookies.role ?? '').toLowerCase();
  if (role === 'admin') {
    return page(200, {
      title: 'Admin',
      blocks: [
        { t: 'h', text: 'Admin panel' },
        { t: 'alert', tone: 'bad', text: 'Signed in as sam, with role admin.' },
        { t: 'kv', rows: [['Customers', '1,204'], ['Orders this month', '318'], ['Refunds waiting', '7']] },
        { t: 'list', items: ['Export every customer', 'Issue a refund', 'Edit prices'] },
      ],
    });
  }
  return page(200, {
    title: 'Your account',
    blocks: [
      { t: 'h', text: 'Hello, Sam' },
      { t: 'p', text: `Signed in as sam, with role ${role || '(none)'}.` },
      { t: 'list', items: ['Order 5521: Atelier desk lamp, shipped', 'Order 5490: Bobbin pendant, delivered'] },
    ],
  });
}

// ---- Level 3: a session cookie that anyone can replay -----------------------

export const SESSIONS: Record<string, string> = {
  'sid-4f19a2c7e0': 'sam',
  'sid-9be03d71c4': 'mara',
};

function replay(req: HttpRequest): HttpResponse {
  if (req.path !== '/account') return notFound(req);
  const user = SESSIONS[req.cookies.sid ?? ''];
  if (!user) return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Please sign in' }, { t: 'p', text: 'That session id is not one the server issued.' }] });
  const orders: Record<string, string[]> = {
    sam: ['Order 5521: Atelier desk lamp, shipped'],
    mara: ['Order 5530: Quai wall light x2, paid with card ending 4417', 'Delivery address: 14 rue des Tanneurs, Lyon'],
  };
  return page(200, {
    title: 'Your account',
    blocks: [
      { t: 'h', text: `Hello, ${user === 'sam' ? 'Sam' : 'Mara'}` },
      { t: 'p', text: `Signed in as ${user}.` },
      { t: 'list', items: orders[user] ?? [] },
    ],
  });
}

// ---- Level 4: a login that sets a cookie scripts can read -------------------

function httponly(req: HttpRequest): HttpResponse {
  if (req.path === '/login' && req.method === 'POST') {
    return page(200, { title: 'Welcome', blocks: [{ t: 'h', text: 'Welcome back, Sam' }, { t: 'p', text: 'You are signed in.' }] }, [['Set-Cookie', 'session=e5d1f0a7c3b9; Path=/']]);
  }
  if (req.path === '/account') {
    if (req.cookies.session === 'e5d1f0a7c3b9') return page(200, { title: 'Account', blocks: [{ t: 'h', text: 'Hello, Sam' }, { t: 'p', text: 'Still signed in: the browser sent the session cookie.' }] });
    return page(401, { title: 'Sign in', blocks: [{ t: 'h', text: 'Please sign in' }] });
  }
  return notFound(req);
}

// ---- Level 5: JWTs, one server trusting the token's own algorithm ---------

export const JWT_SECRET = 'lantern-signing-key-2026';
export const SAM_HEADER = '{"alg":"HS256","typ":"JWT"}';
export const SAM_PAYLOAD = '{"sub":"sam","role":"user","iat":1793952000}';
export const SAM_TOKEN = signHs256(SAM_HEADER, SAM_PAYLOAD, JWT_SECRET);

function jwt(req: HttpRequest): HttpResponse {
  const m = /^\/(v1|v2)\/(me|admin)$/.exec(req.path);
  if (!m) return notFound(req);
  const [, version, what] = m;
  const auth = header(req.headers, 'authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Missing Authorization: Bearer token' });
  const verdict = verifyJwt(token, JWT_SECRET, version === 'v1');
  if (!verdict.ok) return json(401, { error: verdict.reason });
  const sub = String(verdict.payload.sub ?? '');
  const role = String(verdict.payload.role ?? '');
  if (what === 'me') return json(200, { user: sub, role });
  if (role !== 'admin') return json(403, { error: `Role ${role || '(none)'} may not open the admin API.` });
  return json(200, { admin: true, user: sub, customers: 1204, exportUrl: `/${version}/admin/export.csv` });
}

// ---- Boss: an API that answers any origin -----------------------------------

function cors(req: HttpRequest): HttpResponse {
  if (req.path !== '/api/account') return notFound(req);
  return {
    status: 200,
    headers: [
      ['Server', 'nginx'],
      JSONT,
      // {origin} is how the config says "copy whatever Origin the request sent"
      ['Access-Control-Allow-Origin', '{origin}'],
      ['Access-Control-Allow-Credentials', 'true'],
      ['Set-Cookie', 'sid=c09e4471ab2f; Path=/'],
    ],
    body: JSON.stringify({ owner: 'Sam Weller', iban: 'FR76 3000 6000 0112 3456 7890 189', balance: '2,418.50 EUR' }, null, 2),
  };
}

export const SERVERS: Record<WireServerId, (req: HttpRequest) => HttpResponse> = {
  shop,
  'role-cookie': roleCookie,
  replay,
  httponly,
  jwt,
  cors,
};

/** The boss's verdicts: what each origin can read, and how the session cookie is flagged. */
export interface CorsReport {
  evil: { allowed: boolean; reason: string };
  bank: { allowed: boolean; reason: string };
  cookie: { httpOnly: boolean; secure: boolean; sameSite: string } | null;
  hsts: boolean;
}

export function corsReport(headers: [string, string][]): CorsReport {
  const forOrigin = (origin: string): [string, string][] => headers.map(([k, v]) => [k, v.replace(/\{origin\}/g, origin)]);
  const setCookie = header(headers, 'set-cookie');
  const c = setCookie ? parseSetCookie(setCookie) : null;
  const hsts = header(headers, 'strict-transport-security') ?? '';
  return {
    evil: corsAllowsRead(forOrigin('https://evil.example'), 'https://evil.example', true),
    bank: corsAllowsRead(forOrigin('https://bank.example'), 'https://bank.example', true),
    cookie: c ? { httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite } : null,
    hsts: /max-age=\s*[1-9]\d*/i.test(hsts),
  };
}
