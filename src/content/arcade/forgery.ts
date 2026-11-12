// The pairs in Spot the Forgery. Each pair is the same request seen twice at
// the shop's door: one real, one changed by the attacker. Exactly one line
// makes the forgery a forgery. From tier 3 the two cards also differ in a
// harmless line (a different session id, another normal city), so spotting
// "what changed" is not enough: you have to know which change is the attack.
// The rules are the ones The Wire teaches. No attack strings, only the facts a
// gate would see.

export interface CardLine {
  label: string;
  value: string;
}

export interface ForgeryPair {
  id: string;
  /** 1 obvious, 2 needs the rule, 3 subtle or with a harmless difference. */
  tier: 1 | 2 | 3;
  /** What the request is, in a few words, shown above both cards. */
  topic: string;
  /** The real request, line by line. */
  real: CardLine[];
  /** The index of the line the attacker changed, and its forged value. */
  forged: { line: number; value: string };
  /** A harmless difference between the two cards, if any: the line and the value on the forged card. */
  decoy?: { line: number; value: string };
  /** Why the forged line gives it away, in plain words. */
  why: string;
  /** The rule to keep, one line. */
  rule: string;
}

const SHOP = 'https://shop.lantern.example';

export const FORGERY_PAIRS: ForgeryPair[] = [
  // ---- Tier 1: one line, plainly wrong ----------------------------------------
  {
    id: 'role-cookie',
    tier: 1,
    topic: 'Someone opens the admin page',
    real: [
      { label: 'Request', value: 'GET /admin' },
      { label: 'Cookie', value: 'sid=a91f3c' },
      { label: 'The server looked it up', value: 'Session belongs to staff' },
    ],
    forged: { line: 1, value: 'role=admin' },
    why: 'A cookie that just says role=admin is text the browser keeps, so whoever is at the keyboard can type it. Only a session id that the server looks up proves who you are.',
    rule: 'A role written in a cookie proves nothing.',
  },
  {
    id: 'alg-none',
    tier: 1,
    topic: 'The app asks the API for your orders',
    real: [
      { label: 'Request', value: 'GET /api/orders' },
      { label: 'Token alg', value: 'HS256' },
      { label: 'Token says', value: 'user: sam, role: user' },
    ],
    forged: { line: 1, value: 'none' },
    why: 'alg: none means "this token has no signature, don\'t check it". Anyone can write such a token with any name in it.',
    rule: 'A token must be signed with the method the server chose.',
  },
  {
    id: 'origin-evil',
    tier: 1,
    topic: 'A payment is sent with the customer\'s cookies',
    real: [
      { label: 'Request', value: 'POST /api/pay' },
      { label: 'Cookie', value: 'sid=7d1e40' },
      { label: 'Origin', value: SHOP },
    ],
    forged: { line: 2, value: 'https://evil.example' },
    why: 'Origin is the website the request came from, and the browser fills it in. A payment coming from evil.example means a page on another site is using the customer\'s cookies.',
    rule: 'Private actions should only come from our own site.',
  },
  {
    id: 'no-login',
    tier: 1,
    topic: 'Someone reads the staff notes',
    real: [
      { label: 'Request', value: 'GET /staff-notes' },
      { label: 'Cookie', value: 'sid=c40b2e' },
      { label: 'The server looked it up', value: 'Session belongs to staff' },
    ],
    forged: { line: 1, value: 'none sent' },
    why: 'A staff page asked for with no cookie at all: no login, so no proof of who this is. Knowing the address (it is in robots.txt) is not permission.',
    rule: 'A private page needs a login, however its address was found.',
  },

  // ---- Tier 2: you need the rule ---------------------------------------------
  {
    id: 'expired',
    tier: 2,
    topic: 'The app asks who is logged in',
    real: [
      { label: 'Request', value: 'GET /api/me' },
      { label: 'Token alg', value: 'HS256' },
      { label: 'Signature', value: 'Matches the shop key' },
      { label: 'Token expires', value: 'In 40 minutes' },
    ],
    forged: { line: 3, value: 'Yesterday, 18:02' },
    why: 'The token is real and its signature is fine, but it expired yesterday. An old token someone kept, or stole, must stop working.',
    rule: 'An expired token is refused, even with a good signature.',
  },
  {
    id: 'sig-mismatch',
    tier: 2,
    topic: 'Someone cancels an order',
    real: [
      { label: 'Request', value: 'DELETE /api/orders/7001' },
      { label: 'Token alg', value: 'HS256' },
      { label: 'Token says', value: 'user: sam, role: user' },
      { label: 'Signature', value: 'Matches the shop key' },
    ],
    forged: { line: 3, value: 'Does not match' },
    why: 'The signature is worked out from the token and a secret only the shop has. "Does not match" means someone edited the token after it was signed.',
    rule: 'If the signature does not match, the token was tampered with.',
  },
  {
    id: 'copied-session',
    tier: 2,
    topic: 'Sam opens their account',
    real: [
      { label: 'Request', value: 'GET /account' },
      { label: 'Cookie', value: 'sid=4b7a19' },
      { label: 'Logged in from', value: 'Lyon' },
      { label: 'Also in use from', value: 'Nowhere else' },
    ],
    forged: { line: 3, value: 'Rotterdam, this minute' },
    why: 'The same session id is being used from two cities at the same moment. Someone copied it, most likely on open Wi-Fi.',
    rule: 'One session in two places at once has been copied.',
  },
  {
    id: 'customer-admin',
    tier: 2,
    topic: 'Someone opens the admin page',
    real: [
      { label: 'Request', value: 'GET /admin' },
      { label: 'Cookie', value: 'sid=e02d55' },
      { label: 'The server looked it up', value: 'Session belongs to staff' },
    ],
    forged: { line: 2, value: 'Session belongs to a customer' },
    why: 'The session is real, but it is a customer\'s. Being logged in is not the same as being allowed: the admin page is for staff.',
    rule: 'Check what the person may do, not only who they are.',
  },
  {
    id: 'preflight-evil',
    tier: 2,
    topic: 'The browser asks "may I call the payment API?"',
    real: [
      { label: 'Request', value: 'OPTIONS /api/pay' },
      { label: 'Origin', value: SHOP },
      { label: 'Wants to send', value: 'Cookies' },
    ],
    forged: { line: 1, value: 'https://evil.example' },
    why: 'This OPTIONS request is the browser asking permission first, the preflight. When the asker is another website, the answer must be no, and the real call is never sent.',
    rule: 'Say yes to a preflight only for our own site.',
  },

  // ---- Tier 3: subtle, with a harmless difference --------------------------------
  {
    id: 'lookalike-sub',
    tier: 3,
    topic: 'A payment is sent with the customer\'s cookies',
    real: [
      { label: 'Request', value: 'POST /api/pay' },
      { label: 'Cookie', value: 'sid=91aa0e' },
      { label: 'Origin', value: SHOP },
    ],
    forged: { line: 2, value: 'https://shop.lantern.example.pay-check.io' },
    decoy: { line: 1, value: 'sid=3f62b7' },
    why: 'It starts like our address, but the real website is whatever comes last: pay-check.io. Our name at the front is just a label the attacker chose. A different session id on its own is normal: every customer has one.',
    rule: 'Read an address from the right: the end is who owns it.',
  },
  {
    id: 'lookalike-dash',
    tier: 3,
    topic: 'A payment is sent with the customer\'s cookies',
    real: [
      { label: 'Request', value: 'POST /api/pay' },
      { label: 'Cookie', value: 'sid=5c81d2' },
      { label: 'Origin', value: SHOP },
    ],
    forged: { line: 2, value: 'https://shop-lantern.example' },
    decoy: { line: 1, value: 'sid=a0e9f4' },
    why: 'shop-lantern.example, with a dash, is a different website from shop.lantern.example. One character is enough. The different session id is just another customer.',
    rule: 'Lookalike addresses are other websites: compare every character.',
  },
  {
    id: 'http-origin',
    tier: 3,
    topic: 'A payment is sent with the customer\'s cookies',
    real: [
      { label: 'Request', value: 'POST /api/pay' },
      { label: 'Cookie', value: 'sid=77b0aa' },
      { label: 'Origin', value: SHOP },
    ],
    forged: { line: 2, value: 'http://shop.lantern.example' },
    decoy: { line: 1, value: 'sid=12cf08' },
    why: 'http:// without the s is not our site: the shop only runs on https. A page on plain HTTP can be changed by anyone on the same Wi-Fi, so to the browser it counts as a different origin.',
    rule: 'http:// and https:// are different origins.',
  },
  {
    id: 'just-expired',
    tier: 3,
    topic: 'The app asks who is logged in',
    real: [
      { label: 'Request', value: 'GET /api/me' },
      { label: 'Token alg', value: 'HS256' },
      { label: 'Signature', value: 'Matches the shop key' },
      { label: 'Token expires', value: 'In 2 minutes' },
    ],
    forged: { line: 3, value: '2 minutes ago' },
    decoy: { line: 0, value: 'GET /api/me?lang=fr' },
    why: '"2 minutes ago" is already in the past: expired is expired, by a second or a day. Asking for the page in French changes nothing.',
    rule: 'Check the expiry exactly; there is no grace period.',
  },
  {
    id: 'extra-role-cookie',
    tier: 3,
    topic: 'Someone opens the admin page',
    real: [
      { label: 'Request', value: 'GET /admin' },
      { label: 'Cookies', value: 'sid=a91f3c; theme=dark' },
      { label: 'Logged in from', value: 'Lyon office' },
    ],
    forged: { line: 1, value: 'sid=a91f3c; role=admin' },
    decoy: { line: 2, value: 'Lyon office, second screen' },
    why: 'The session is real, but someone added role=admin next to it, hoping the server reads the role from the cookie. A theme cookie is harmless; a role cookie is an attempt to promote yourself.',
    rule: 'Roles come from the server, never from a cookie the browser sends.',
  },
  {
    id: 'alg-none-quiet',
    tier: 3,
    topic: 'The app saves your address',
    real: [
      { label: 'Request', value: 'POST /api/address' },
      { label: 'Token alg', value: 'HS256' },
      { label: 'Token says', value: 'user: sam, role: user' },
      { label: 'Token expires', value: 'In 25 minutes' },
    ],
    forged: { line: 1, value: 'none' },
    decoy: { line: 3, value: 'In 55 minutes' },
    why: 'The token claims nothing unusual, but alg: none means it was never signed, so nobody can tell who wrote it. A different expiry time is normal: tokens are issued at different moments.',
    rule: 'An unsigned token is a forgery even when it asks for nothing special.',
  },
  {
    id: 'staff-notes-robots',
    tier: 3,
    topic: 'Someone reads the staff notes',
    real: [
      { label: 'Request', value: 'GET /staff-notes' },
      { label: 'Found the address in', value: 'A staff bookmark' },
      { label: 'Cookie', value: 'sid=c40b2e (staff)' },
    ],
    forged: { line: 2, value: 'none sent' },
    decoy: { line: 1, value: 'robots.txt' },
    why: 'Where the address was found does not matter: robots.txt is public and staff can read it too. What matters is the missing cookie, so there is no login at all.',
    rule: 'Judge the login, not the route someone took to the address.',
  },
];

export const PAIR_BY_ID = Object.fromEntries(FORGERY_PAIRS.map((p) => [p.id, p])) as Record<string, ForgeryPair>;

/** The forged card's lines, built from the real one. */
export function forgedLines(p: ForgeryPair): CardLine[] {
  return p.real.map((l, i) => {
    if (i === p.forged.line) return { ...l, value: p.forged.value };
    if (p.decoy && i === p.decoy.line) return { ...l, value: p.decoy.value };
    return l;
  });
}
