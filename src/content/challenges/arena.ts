import type { ArenaLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge, CUSTOMERS } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import {
  MARK,
  PAD_LINES,
  PUBLIC_SITES,
  listing,
  makeLogin,
  makeSearch,
  makeInvoices,
  makePing,
  makePreview,
  makeSignup,
  type ArenaApp,
  type AppInput,
  type Invoice,
} from '../../sim/arena';

const guided = (id: string) => LEVEL_BY_ID[id] as ArenaLevel;
const pad = (rng: Rng) => rng.sample(PAD_LINES, rng.int(0, 3));

/** The level around a built app: its brief, three graded hints (the line, then the shape of the fix). */
function variant(id: string, app: ArenaApp, over: { goal: string; instruction: string; url?: string; appName?: string }, hints: [string, string], signature: string) {
  const fault = listing(app, app.code.edit).fault;
  const level = asChallenge(guided(id), { ...over, custom: app });
  return {
    level,
    signature,
    hints: [hints[0], `The input does its damage on line ${fault}.`, hints[1]],
    solution: { kind: 'arena' as const, fix: app.code.fix },
  };
}

const SQL = [MARK.sqlBreakout, MARK.sqlComment, MARK.sqlAlwaysTrue];
const FIELDS: [string, string][] = [
  ['name', 'pass'],
  ['user', 'password'],
  ['login', 'secret'],
  ['username', 'pwd'],
];

const sqli: ChallengeGenerator = (rng) => {
  const [userField, passField] = rng.pick(FIELDS);
  const marks = rng.shuffle(SQL);
  const people = rng.sample(CUSTOMERS, 2);
  const users = [
    { id: 1, name: 'admin', pass: `${rng.hex(6)}!Lamp`, role: 'admin' },
    ...people.map((p, i) => ({ id: i + 2, name: p.user, pass: `${rng.pick(['tulip', 'river', 'brass', 'quai', 'amber'])}-${rng.int(10, 99)}`, role: 'customer' })),
  ];
  const customer = users[1]!;
  const app = makeLogin({
    userField,
    passField,
    users,
    attack: { name: marks[0]!, pass: 'anything' },
    variants: [{ name: marks[1]!, pass: 'anything' }, { name: marks[2]!, pass: 'anything' }],
    customer: { name: String(customer.name), pass: String(customer.pass) },
    pad: pad(rng),
    challenge: true,
  });
  return variant(
    'arena-sqli',
    app,
    { goal: 'Find why someone got in as admin without a password, and fix it.', instruction: 'Someone signed in to the staff login as admin with no password, and the database never noticed.' },
    [`Follow \`${userField}\` from the request to where it meets the SQL text.`, `Use \`?\` placeholders in the SQL and pass \`[${userField}, ${passField}]\` as the second argument of \`db.query\`.`],
    `${userField}/${passField}:${marks[0]}:${app.code.pre.split('\n').length}`,
  );
};

const xss: ChallengeGenerator = (rng) => {
  const param = rng.pick(['q', 'term', 'query', 'words', 's']);
  const heading = rng.pick(['Results for', 'You searched for', 'Matches for']);
  const route = rng.pick(['/search', '/find', '/catalogue/search']);
  const word = rng.pick(['brass', 'lamp', 'light', 'pendant']);
  const [a, b] = rng.shuffle([MARK.markup, MARK.markupAttr]);
  const app = makeSearch({
    param,
    route,
    heading,
    catalogue: ['Atelier brass desk lamp', 'Brass picture light', 'Quai wall light', 'Bobbin pendant', 'Oak floor lamp', 'Harbor lantern'],
    attack: { q: a! },
    variants: [{ q: b! }],
    normal: [{ q: word }, { q: rng.pick(['Tom & Jo\'s "lamp"', 'A&B "Rive" lamp', 'Café "Rive" light']) }],
    pad: pad(rng),
    challenge: true,
  });
  return variant(
    'arena-xss',
    app,
    { goal: "Find why a search link can run an attacker's script, and fix it.", instruction: 'A search link made the shop run markup it was sent, in a customer\'s browser.', url: `https://shop.lantern.example${route}` },
    [`Follow \`${param}\` to where the page is built.`, `Wrap it as \`escapeHtml(${param})\` where it goes into the HTML.`],
    `${param}:${heading}:${route}:${a}`,
  );
};

const THINGS: [string, string][] = [
  ['invoices', 'invoice'],
  ['orders', 'order'],
  ['receipts', 'receipt'],
  ['quotes', 'quote'],
];

const idor: ChallengeGenerator = (rng) => {
  const [resource, one] = rng.pick(THINGS);
  const me = { id: `u-${rng.int(10, 99)}`, name: rng.pick(['sam', 'lena', 'omar', 'jules']) };
  const base = rng.int(1100, 8800);
  const ids = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => String(base + n)), 5);
  const strangers = rng.sample([...CUSTOMERS.map((c) => c.name), 'Atelier Rive SARL'], 3);
  const records: Record<string, Invoice> = {};
  ids.forEach((id, i) => {
    const mine = i < 2;
    records[id] = { id: Number(id), ownerId: mine ? me.id : `u-${rng.int(100, 199)}`, customer: mine ? `${me.name} (you)` : strangers[i - 2]!, total: `${rng.int(100, 4000)}.00 EUR`, items: `${rng.int(1, 20)} x Quai wall light` };
  });
  const app = makeInvoices({
    resource,
    one,
    me,
    records,
    attackId: ids[2]!,
    variantIds: [ids[3]!, ids[4]!],
    ownId: ids[0]!,
    missingId: String(base + 50),
    pad: pad(rng),
    challenge: true,
  });
  return variant(
    'arena-idor',
    app,
    { goal: `Find why one customer could read another's ${one}, and fix it.`, instruction: `A signed-in customer opened someone else's ${one} just by changing the number in the address.`, url: `https://shop.lantern.example/api/${resource}/${ids[0]}`, appName: `Lantern & Co. ${resource} API` },
    [`The server checks that someone is signed in. What does it never compare?`, `Answer 404 when \`${one}.ownerId !== req.user.id\`, in the same \`if\` as the missing case.`],
    `${resource}:${me.id}:${ids.join(',')}`,
  );
};

const cmdi: ChallengeGenerator = (rng) => {
  const name = rng.pick(['host', 'target', 'addr', 'ip']);
  const count = rng.pick(['1', '2', '3']);
  const normalHost = rng.pick(['9.9.9.9', '1.1.1.1', '203.0.113.10']);
  const chainFirst = rng.chance(0.5);
  const attack: AppInput = chainFirst ? { host: `${normalHost} ${MARK.shellChain}` } : { host: MARK.shellSubst };
  const other: AppInput = chainFirst ? { host: MARK.shellSubst } : { host: `${normalHost} ${MARK.shellChain}` };
  const app = makePing({ name, count, normalHost, attack, variants: [other], pad: pad(rng), challenge: true });
  return variant(
    'arena-cmdi',
    app,
    { goal: 'Find how the network check ran a second command, and close it for good.', instruction: 'The staff network check ran a second, hidden command on the server.' },
    ['A shell reads some characters in a command line as its own syntax. Where does the line get built?', `Skip the shell: \`execFile('ping', ['-c', '${count}', ${name}])\` passes it as one argument.`],
    `${name}:${count}:${normalHost}:${chainFirst}`,
  );
};

const INTERNAL = ['http://169.254.169.254/latest/meta-data/', 'http://localhost:8080/', 'http://169.254.169.254.nip.io/', 'http://[::1]/', 'http://10.0.8.40:5432/', 'http://127.0.0.1:9000/admin'];

const ssrf: ChallengeGenerator = (rng) => {
  const allowed = rng.sample(Object.keys(PUBLIC_SITES), 2);
  const name = rng.pick(['target', 'link', 'dest', 'address']);
  const urls = rng.shuffle(INTERNAL);
  const app = makePreview({
    allowed,
    name,
    attack: { url: urls[0]! },
    variants: urls.slice(1, 4).map((url) => ({ url })),
    normalUrl: `https://${allowed[0]}/${rng.pick(['2026/11/', 'posts/', 'a/'])}${rng.hex(4)}`,
    pad: pad(rng),
    challenge: true,
  });
  return variant(
    'arena-ssrf',
    app,
    { goal: "Find how the link preview reached inside the network, and fix it.", instruction: 'The link preview fetched an address only the inside of the network should answer.' },
    ['The server fetches from inside its own network. Which sites should it ever fetch?', `Above the fetch, answer 400 unless \`ALLOWED_HOSTS.includes(${name}.hostname)\`.`],
    `${allowed.join(',')}:${name}:${urls[0]}`,
  );
};

const DEFAULT_FIELDS: Record<string, [unknown, unknown]> = {
  role: ['customer', 'admin'],
  credits: [0, 5000],
  verified: [false, true],
  plan: ['free', 'enterprise'],
  isAdmin: [false, true],
  discount: [0, 100],
};
const SIGNUP_FIELDS = [['name', 'email'], ['name', 'email', 'city'], ['username', 'email'], ['name', 'email', 'phone']];

const mass: ChallengeGenerator = (rng) => {
  const fields = rng.pick(SIGNUP_FIELDS);
  const keys = ['role', ...rng.sample(Object.keys(DEFAULT_FIELDS).filter((k) => k !== 'role'), 2)];
  const defaults = Object.fromEntries(keys.map((k) => [k, DEFAULT_FIELDS[k]![0]]));
  const person = rng.pick(CUSTOMERS);
  const values: Record<string, string> = { name: person.name.split(' ')[0]!, username: person.user, email: `${person.user}@mail.example`, city: 'Lyon', phone: `+33 6 ${rng.int(10, 99)} ${rng.int(10, 99)} ${rng.int(10, 99)} ${rng.int(10, 99)}` };
  const body = (extra?: string) => JSON.stringify({ ...Object.fromEntries(fields.map((f) => [f, values[f]])), ...(extra ? { [extra]: DEFAULT_FIELDS[extra]![1] } : {}) });
  const order = rng.shuffle(keys);
  const app = makeSignup({
    fields,
    defaults,
    attack: { body: body(order[0]) },
    variants: order.slice(1).map((k) => ({ body: body(k) })),
    normal: { body: body() },
    pad: pad(rng),
    challenge: true,
  });
  const list = fields.join(', ');
  return variant(
    'arena-mass',
    app,
    { goal: `Find how a new account came out with ${order[0]} set by the attacker, and fix sign-up.`, instruction: `A brand-new account came out with a ${order[0]} the form never offers.` },
    ['What does sign-up save, exactly: the fields the form has, or everything it was sent?', `Pull out the allowed fields with \`const { ${list} } = req.body;\` and create the user from \`{ ${list} }\` only.`],
    `${list}:${order.join(',')}`,
  );
};

export const ARENA_CHALLENGES: Record<string, ChallengeGenerator> = {
  'arena-sqli': sqli,
  'arena-xss': xss,
  'arena-idor': idor,
  'arena-cmdi': cmdi,
  'arena-ssrf': ssrf,
  'arena-mass': mass,
};
