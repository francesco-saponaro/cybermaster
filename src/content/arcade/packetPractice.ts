// The practice round for Packet Runner: nine cards, one for each thing the
// gate has to spot, in the order a beginner learns them. No clock and no
// lives; each card says where to look before you answer, and why after.

export interface PracticeCard {
  /** A request from the real game. */
  template: string;
  /** The line of the card that decides it. */
  key: 'req' | 'header' | 'note';
  /** Where to look and what it means, before the player answers. */
  look: string;
  /** The rule to take away, after the answer. */
  rule: string;
}

export const PACKET_PRACTICE: PracticeCard[] = [
  {
    template: 'ok-products',
    key: 'req',
    look: 'Start with the top line. GET /products asks to read the product list, and the product list is public. Nobody needs to be logged in to see it, so "No cookie" is fine here.',
    rule: 'Public pages are for everyone: allow them.',
  },
  {
    template: 'bad-role-cookie',
    key: 'header',
    look: 'Now the middle line. The only proof of who this is: a cookie that says role=admin. Cookies live in the browser, so the person at the keyboard can type anything into one. The bottom line confirms there is no real session behind it.',
    rule: 'A role written in a plain cookie proves nothing: block it.',
  },
  {
    template: 'ok-admin-staff',
    key: 'note',
    look: 'Same page, /admin. This time the middle line is a session id (sid), a random code the server handed out at login. The bottom line says the server looked that code up and it belongs to a staff member.',
    rule: 'A real session the server has checked, asking for something it may see: allow it.',
  },
  {
    template: 'bad-notes-anon',
    key: 'note',
    look: '/staff-notes is a staff page and there is no cookie at all. The bottom line says it was found in robots.txt. That file only asks search engines not to list a page. It is a sign on the door, not a lock.',
    rule: 'A private page with no login gets blocked, however the address was found.',
  },
  {
    template: 'ok-orders-token',
    key: 'header',
    look: 'Some requests carry a token instead of a cookie. alg: HS256 says the token was signed with the shop\'s secret key, and the bottom line says that signature checks out, so nobody has changed the token.',
    rule: 'A signed token whose signature checks out: allow it.',
  },
  {
    template: 'bad-alg-none',
    key: 'header',
    look: 'alg: none means the token says "I have no signature, don\'t check me". Anyone can write a token like that and put any name or role in it.',
    rule: 'alg: none, or a signature that does not match: block it.',
  },
  {
    template: 'bad-exp',
    key: 'header',
    look: 'exp is the time a token stops being valid. The signature is fine, but this one expired yesterday, so it should no longer open anything.',
    rule: 'An expired token gets blocked, even with a good signature.',
  },
  {
    template: 'bad-origin',
    key: 'header',
    look: 'Origin is the website a request comes from; the browser adds it. A payment made from evil.example means a page on another website is spending the customer\'s money using their cookies.',
    rule: 'A request from another website to a private action: block it. Our own Origin is fine.',
  },
  {
    template: 'bad-replay',
    key: 'note',
    look: 'The cookie looks normal on its own. The bottom line is the giveaway: the same session id is in use from another city at the same moment. Someone copied it.',
    rule: 'The same session from two places at once has been copied: block it.',
  },
];
