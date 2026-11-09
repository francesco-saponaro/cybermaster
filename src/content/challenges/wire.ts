import type { WireLevel, WireState } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge, cap, CUSTOMERS } from './types';
import { LEVEL_BY_ID } from '../index';
import { SHOP_DEFAULT, type CorsParams, corsReport } from '../../sim/wire';
import { signHs256, header } from '../../sim/http';

const guided = (id: string) => LEVEL_BY_ID[id] as WireLevel;
const sent = (s: WireState, path: string, status = 200) => s.exchanges.some((e) => e.req.path === path && e.res.status === status);

const HIDDEN = ['/staff-notes', '/ops-backup', '/old-admin', '/drafts', '/stock-sheet', '/price-review', '/warehouse-notes', '/dev-notes'];
const DECOYS = ['/cart', '/checkout/test', '/search', '/tmp', '/beta', '/print', '/export'];

const robots: ChallengeGenerator = (rng) => {
  const hidden = rng.pick(HIDDEN);
  const decoys = rng.sample(DECOYS, rng.int(2, 3));
  const disallow = rng.shuffle([hidden, ...decoys]);
  const shop = { ...SHOP_DEFAULT, hidden, disallow, missing: decoys.filter((d) => d !== '/cart') };
  const level = asChallenge(guided('wire-robots'), {
    goal: 'Find the page the shop tried to hide, and open it.',
    instruction: 'One of the paths the shop asks search engines to skip is a real page nobody linked.',
    params: { shop },
    evaluate: (s) => ({ sent: s.exchanges.length > 0, robots: sent(s, '/robots.txt'), hidden: sent(s, hidden) }),
  });
  return {
    level,
    signature: hidden + disallow.join(','),
    hints: [
      'Sites list the pages search engines should skip in a public file at the root of the site.',
      'Request /robots.txt, then try each Disallow line: only one of them is a real page.',
      `The page is ${hidden}.`,
    ],
    solution: { kind: 'wire', moves: [{ send: true }, { path: '/robots.txt', send: true }, { path: hidden, send: true }] },
  };
};

const ROLE_SHAPES = [
  { cookie: 'role', userValue: 'customer', adminValue: 'admin' },
  { cookie: 'is_admin', userValue: 'false', adminValue: 'true' },
  { cookie: 'access', userValue: 'basic', adminValue: 'admin' },
  { cookie: 'staff', userValue: '0', adminValue: '1' },
  { cookie: 'tier', userValue: 'user', adminValue: 'admin' },
  { cookie: 'level', userValue: 'member', adminValue: 'admin' },
];

const role: ChallengeGenerator = (rng) => {
  const shape = rng.pick(ROLE_SHAPES);
  const who = rng.pick(['sam', ...CUSTOMERS.map((c) => c.user)]);
  const session = rng.hex(12);
  const request = `GET /account HTTP/1.1\nHost: shop.lantern.example\nUser-Agent: Mozilla/5.0\nCookie: session=${session}; ${shape.cookie}=${shape.userValue}`;
  const level = asChallenge(guided('wire-cookie-role'), {
    goal: "Reach the shop's admin panel.",
    instruction: `You are signed in as ${who}, an ordinary customer, and the shop decides who is staff from something your browser sends.`,
    request,
    params: { role: { session, user: who, ...shape } },
    evaluate: (s) => ({ sent: sent(s, '/account'), admin: s.exchanges.some((e) => e.res.view?.title === 'Admin') }),
  });
  return {
    level,
    signature: `${shape.cookie}=${shape.userValue}:${who}`,
    hints: [
      'The server decides who you are from a value your browser sends with every request, and you can edit it.',
      `Look at the Cookie line: \`${shape.cookie}=${shape.userValue}\` is yours to change.`,
      `Set \`${shape.cookie}\` to \`${shape.adminValue}\` and Send.`,
    ],
    solution: { kind: 'wire', moves: [{ send: true }, { request: request.replace(`${shape.cookie}=${shape.userValue}`, `${shape.cookie}=${shape.adminValue}`), send: true }] },
  };
};

const PLACES = ['café Wi-Fi', 'station Wi-Fi', 'hotel Wi-Fi', 'library Wi-Fi'];

const replay: ChallengeGenerator = (rng) => {
  const [victim, other] = rng.sample(CUSTOMERS, 2) as [(typeof CUSTOMERS)[number], (typeof CUSTOMERS)[number]];
  const sid = () => `sid-${rng.hex(10)}`;
  const mine = sid();
  const theirs = sid();
  const others = sid();
  const expired = sid();
  const place = rng.pick(PLACES);
  const raw = (id: string, agent: string) => `GET /account HTTP/1.1\nHost: shop.lantern.example\nUser-Agent: ${agent}\nCookie: sid=${id}`;
  const times = rng.sample(['09:41', '10:02', '10:17', '10:26', '10:48', '11:05'], 3).sort();
  const caught = rng.shuffle([
    { id: theirs, agent: 'Mozilla/5.0 (iPhone)' },
    { id: others, agent: 'Mozilla/5.0 (Android 14)' },
    { id: expired, agent: 'Mozilla/5.0 (Macintosh)' },
  ]);
  const captured = [
    { label: 'GET /account  you, 09:30', raw: raw(mine, 'Mozilla/5.0') },
    ...caught.map((c, i) => ({ label: `GET /account  ${place}, ${times[i]}`, raw: raw(c.id, c.agent) })),
  ];
  const level = asChallenge(guided('wire-replay'), {
    goal: `Get into ${victim.name.split(' ')[0]}'s account without a password.`,
    instruction: `The proxy caught three requests on the ${place}, and one of them still carries ${victim.name.split(' ')[0]}'s live session.`,
    request: raw(mine, 'Mozilla/5.0'),
    captured,
    params: {
      replay: {
        sessions: {
          [mine]: { user: 'sam', lines: ['Order 5521: Atelier desk lamp, shipped'] },
          [theirs]: { user: victim.user, lines: [`Order ${rng.int(5500, 5600)}: Quai wall light, paid with card ending ${rng.int(1000, 9999)}`, `Delivery address: ${rng.int(2, 40)} rue des Tanneurs, Lyon`] },
          [others]: { user: other.user, lines: [`Order ${rng.int(5500, 5600)}: Bobbin pendant, delivered`] },
        },
        expired: [expired],
      },
    },
    evaluate: (s) => ({
      mine: s.exchanges.some((e) => e.res.body.includes('Signed in as sam')),
      mara: s.exchanges.some((e) => e.res.body.includes(`Signed in as ${victim.user}.`)),
    }),
  }, guided('wire-replay').checks.map((c) => (c.id === 'mara' ? { ...c, label: `Get into ${victim.name.split(' ')[0]}'s account` } : c)));
  return {
    level,
    signature: `${victim.user}:${caught.findIndex((c) => c.id === theirs)}:${place}`,
    hints: [
      "After sign-in, a session id is all the server checks. The proxy caught other people's.",
      `Load each ${place} capture into the request box and Send it: one is still signed in as ${victim.user}.`,
      `${cap(victim.user)}'s live session is \`${theirs}\`.`,
    ],
    solution: { kind: 'wire', moves: [{ send: true }, { request: raw(theirs, 'Mozilla/5.0 (iPhone)'), send: true }] },
  };
};

const COOKIE_NAMES = ['session', 'sid', 'auth', 'lc_sess', 'shop_session'];

const httponly: ChallengeGenerator = (rng) => {
  const cookie = rng.pick(COOKIE_NAMES);
  const value = rng.hex(12);
  const who = rng.pick(CUSTOMERS);
  const first = who.name.split(' ')[0]!;
  const request = `POST /login HTTP/1.1\nHost: shop.lantern.example\nContent-Type: application/x-www-form-urlencoded\n\nname=${who.user}&pass=${rng.hex(8)}`;
  const flaggedLine = (t: string) => t.split('\n').map((l) => (l.startsWith(`Set-Cookie: ${cookie}=`) ? `${l}; HttpOnly` : l)).join('\n');
  const isFlagged = (s: WireState) => s.forwarded.some((r) => r.headers.some(([k, v]) => k.toLowerCase() === 'set-cookie' && v.startsWith(`${cookie}=`) && /;\s*httponly/i.test(v)));
  const level = asChallenge(guided('wire-httponly'), {
    goal: `Keep ${first} signed in with a session cookie no script on the page can read.`,
    instruction: 'The reply stops in the proxy before the browser sees it, and right now any script on the page can read the session.',
    request,
    params: { httponly: { cookie, value, user: first } },
    evaluate: (s) => {
      const flagged = isFlagged(s);
      const inJar = s.jar.some((k) => k.name === cookie && k.httpOnly);
      return {
        read: s.console.some((c) => /document\.cookie/.test(c.input) && c.output.includes(`${cookie}=`)),
        flag: flagged,
        hidden: flagged && inJar && s.console.some((c) => /document\.cookie/.test(c.input) && !c.output.includes(`${cookie}=`)),
        still: flagged && inJar && s.exchanges.some((e) => e.req.path === '/account' && e.res.status === 200),
      };
    },
  });
  return {
    level,
    signature: `${cookie}:${who.user}`,
    hints: [
      'First prove the problem: Forward the login, then run document.cookie in the console.',
      'One cookie attribute keeps a cookie away from JavaScript. Add it in the held response before you Forward.',
      `End the line with \`; HttpOnly\`: \`Set-Cookie: ${cookie}=${value}; Path=/; HttpOnly\`, then run document.cookie again.`,
    ],
    solution: { kind: 'wire', moves: [{ send: true, forward: true }, { console: 'document.cookie' }, { send: true }, { held: flaggedLine }, { forward: true }, { console: 'document.cookie' }] },
  };
};

const VERSIONS: [string, string][] = [
  ['v1', 'v2'],
  ['v2', 'v3'],
  ['legacy', 'v4'],
  ['2024', '2026'],
];

const jwt: ChallengeGenerator = (rng) => {
  const [oldVer, newVer] = rng.pick(VERSIONS);
  const claim = rng.pick(['role', 'group', 'scope']);
  const sub = rng.pick(['sam', ...CUSTOMERS.map((c) => c.user)]);
  const secret = `lantern-${rng.hex(10)}`;
  const iat = 1793952000 + rng.int(0, 400000);
  const payload = (v: string) => `{"sub":"${sub}","${claim}":"${v}","iat":${iat}}`;
  const token = signHs256('{"alg":"HS256","typ":"JWT"}', payload('user'), secret);
  const request = `GET /${oldVer}/me HTTP/1.1\nHost: api.lantern.example\nAuthorization: Bearer ${token}`;
  const base = guided('wire-jwt');
  const level = asChallenge(base, {
    goal: `Become admin on the ${oldVer} API, and confirm ${newVer} refuses the same token.`,
    instruction: `The API reads your ${claim} from a signed token, and the old ${oldVer} version decides how to check it from the token itself.`,
    request,
    params: { jwt: { secret, oldVer, newVer, claim } },
    evaluate: (s) => ({
      tampered: s.exchanges.some((e) => e.res.status === 401 && e.res.body.includes('Invalid signature')),
      v1: sent(s, `/${oldVer}/admin`),
      v2: s.exchanges.some((e) => e.req.path === `/${newVer}/admin` && e.res.status === 401 && /none\\?" refused/.test(e.res.body)),
    }),
  }, base.checks.map((c) => ({ ...c, label: c.label.replace(/v1/g, oldVer).replace(/v2/g, newVer) })));
  return {
    level,
    signature: `${oldVer}/${newVer}:${claim}:${sub}`,
    hints: [
      `Changing the ${claim} breaks the signature. Try it on /${oldVer}/admin and read the error.`,
      `The ${oldVer} API lets the token name its own algorithm. One algorithm means no signature at all.`,
      `Header \`{"alg":"none","typ":"JWT"}\`, an empty Signature, \`"${claim}":"admin"\` in the payload. Then send the same token to /${newVer}/admin.`,
    ],
    solution: {
      kind: 'wire',
      moves: [
        { path: `/${oldVer}/admin`, jwtPayload: payload('admin'), send: true },
        { jwtHeader: '{"alg":"none","typ":"JWT"}', jwtSignature: '', send: true },
        { path: `/${newVer}/admin`, send: true },
      ],
    },
  };
};

const TRUSTED = ['https://bank.example', 'https://pay.lantern.example', 'https://app.lantern.example', 'https://wallet.example'];
const EVIL = ['https://evil.example', 'https://prizes.example', 'https://free-lamps.example', 'https://parcel-track.example'];
const PATHS = ['/api/account', '/api/me', '/api/wallet', '/v1/balance'];

const cors: ChallengeGenerator = (rng) => {
  const who = rng.pick([{ user: 'sam', name: 'Sam Weller' }, ...CUSTOMERS]);
  const p: CorsParams = {
    trusted: rng.pick(TRUSTED),
    evil: rng.pick(EVIL),
    path: rng.pick(PATHS),
    cookie: rng.pick(['sid', 'session', 'auth']),
    value: rng.hex(12),
    owner: who.name,
    iban: `FR76 3000 ${rng.int(1000, 9999)} ${rng.int(1000, 9999)} ${rng.int(1000, 9999)} ${rng.int(1000, 9999)} ${rng.int(100, 999)}`,
    balance: `${rng.int(1, 9)},${rng.int(100, 999)}.${rng.int(10, 99)} EUR`,
  };
  const bare = p.trusted.replace('https://', '');
  const apiHost = `api.${bare.split('.').length > 2 ? bare.split('.').slice(1).join('.') : bare}`;
  const request = `GET ${p.path} HTTP/1.1\nHost: ${apiHost}\nOrigin: ${p.trusted}\nCookie: ${p.cookie}=${p.value}`;
  const base = guided('wire-cors');
  const short = p.trusted.replace('https://', '');
  const fixed = (t: string) =>
    t
      .split('\n')
      .map((l) => (l.startsWith('Access-Control-Allow-Origin') ? `Access-Control-Allow-Origin: ${p.trusted}` : l.startsWith('Set-Cookie') ? `${l}; HttpOnly; Secure; SameSite=Lax` : l))
      .join('\n') + '\nStrict-Transport-Security: max-age=31536000';
  const level = asChallenge(base, {
    goal: `Only ${short} may read the account, the session cookie is locked down, and HTTPS is enforced.`,
    instruction: `A page on ${p.evil.replace('https://', '')} can read ${who.name.split(' ')[0]}'s account through this API, and the session cookie travels unprotected.`,
    host: apiHost,
    request,
    params: { cors: p },
    evaluate: (s) => {
      const last = s.forwarded[s.forwarded.length - 1];
      if (!last) return { evil: false, bank: false, cookie: false, hsts: false };
      const r = corsReport(last.headers, p.trusted, p.evil, p.cookie);
      return {
        evil: !r.evil.allowed,
        bank: r.bank.allowed,
        cookie: !!r.cookie && r.cookie.httpOnly && r.cookie.secure && (r.cookie.sameSite === 'Lax' || r.cookie.sameSite === 'Strict'),
        hsts: r.hsts && !!header(last.headers, 'strict-transport-security'),
      };
    },
  }, base.checks.map((c) => (c.id === 'evil' ? { ...c, label: `Stop ${p.evil.replace('https://', '')} reading the account` } : c.id === 'bank' ? { ...c, label: `Keep ${short} working` } : c)));
  return {
    level,
    signature: `${p.trusted}|${p.evil}|${p.cookie}|${p.path}`,
    hints: [
      'Send and Forward once to see who can read what. The Allow-Origin header copies whatever origin asks.',
      `Name ${p.trusted} on the Allow-Origin line, and give the ${p.cookie} cookie the three flags that keep it from scripts, plain HTTP and other sites.`,
      'Add `; HttpOnly; Secure; SameSite=Lax` to the Set-Cookie line and a `Strict-Transport-Security: max-age=31536000` line.',
    ],
    solution: { kind: 'wire', moves: [{ send: true }, { held: fixed }, { forward: true }] },
  };
};

export const WIRE_CHALLENGES: Record<string, ChallengeGenerator> = {
  'wire-robots': robots,
  'wire-cookie-role': role,
  'wire-replay': replay,
  'wire-httponly': httponly,
  'wire-jwt': jwt,
  'wire-cors': cors,
};
