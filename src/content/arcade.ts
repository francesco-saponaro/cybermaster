// The five arcade games: one bonus round per zone, opened by the zone's boss.
// What each one is called, who sends you in, how to play it, and the scores
// its stars need.

import type { ZoneId } from './types';
import type { Speaker } from './story';

export type GameId = 'packet-runner' | 'tower-defence' | 'network-sweeper' | 'lockdown' | 'triage-rush';

export interface ArcadeGame {
  id: GameId;
  zone: ZoneId;
  title: string;
  /** One line for the arcade list. */
  tagline: string;
  /** What a run teaches, in one sentence. */
  teaches: string;
  /** The teammate's line on the start screen, tied to the case. */
  speaker: Speaker;
  line: string;
  /** Three short lines on how to play. */
  howTo: [string, string, string];
  /** Keys and what they do; the touch buttons are on screen. */
  controls: { keys: string; does: string }[];
  /** Scores for one, two and three stars. */
  stars: [number, number, number];
  /** About how long a run lasts, in seconds. */
  seconds: number;
  /** What each thing on the board is, in plain words, for someone who has never seen it. */
  board: string[];
  /** Short rules to keep in mind, shown on the start screen and on pause. */
  rules: { title: string; items: { label: string; text: string }[] }[];
  /** Glossary ids for every technical word on the board. */
  words: string[];
}

export const ARCADE: ArcadeGame[] = [
  {
    id: 'packet-runner',
    zone: 'wire',
    title: 'Packet Runner',
    tagline: 'Let the customers in, stop the forged requests',
    teaches: 'Spotting an edited cookie, a missing login, a foreign Origin, an unsigned or expired token and a copied session at a glance.',
    speaker: 'Bruno',
    line: "This is Monday night's traffic at the shop's front door, sped up. Let the customers through and stop what the attacker sent.",
    howTo: [
      'Requests slide along three lanes towards the gate on the right.',
      'Pick a lane, then allow or block the request waiting in its gate.',
      'A wrong call costs a life. Right calls in a row build a multiplier.',
    ],
    controls: [
      { keys: 'Up / Down or W / S', does: 'Change lane' },
      { keys: 'Right or A', does: 'Allow' },
      { keys: 'Left or B', does: 'Block' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [2000, 7000, 15000],
    seconds: 90,
    board: [
      'Each card is one request arriving at the shop. It has three lines.',
      'Top line: what is being asked for, like GET /admin (open the admin page) or POST /api/pay (make a payment).',
      'Middle line: the one header that decides it: a cookie, a token, or where the request came from.',
      'Bottom line: what the gate knows about it, like "Server: session is staff" or "Signature checks out".',
      'Cards wait in the gate on the right. Pick a lane, then Allow or Block the card in that lane. A card left waiting too long walks off and breaks your combo.',
    ],
    rules: [
      {
        title: 'Allow',
        items: [
          { label: 'Public pages', text: 'Products, robots.txt and the login form are meant for anyone, cookie or not.' },
          { label: 'A real session', text: 'A sid the server has looked up, asking for its own things, or staff asking for staff pages.' },
          { label: 'A good token', text: 'Token alg: HS256 with "Signature checks out", and not expired.' },
          { label: 'Our own site', text: 'Origin: shop.lantern.example, including its OPTIONS preflight.' },
        ],
      },
      {
        title: 'Block',
        items: [
          { label: 'Role in a cookie', text: 'Cookie: role=admin with no real session. The browser can edit that.' },
          { label: 'No login on a private page', text: 'No cookie or no token on /admin, /staff-notes or /api/orders. robots.txt does not make a page public.' },
          { label: 'A bad token', text: 'alg: none (unsigned), a signature that does not match, or exp in the past.' },
          { label: 'Another website', text: 'Origin: evil.example on a payment or its preflight.' },
          { label: 'A copied session', text: 'The same sid used from another city at the same time.' },
          { label: 'Wrong role', text: 'The server says the session is a customer, but it wants /admin.' },
        ],
      },
    ],
    words: ['get', 'post', 'delete', 'options', 'header', 'cookie', 'sid', 'role-cookie', 'robots', 'token', 'alg', 'hs256', 'alg-none', 'signature', 'exp', 'origin', 'replay'],
  },
  {
    id: 'tower-defence',
    zone: 'arena',
    title: 'Hold the Line',
    tagline: 'Put the right fix in front of each attack',
    teaches: 'Which fix stops which attack: a parameterised query stops SQL injection and nothing else, and a WAF slows everything but stops nothing.',
    speaker: 'Ines',
    line: 'Every attack in the log is heading for the database again. Put the right fix in its way. The firewall only slows them down.',
    howTo: [
      'Attacks walk the path to the database. Each wave is shown before it starts.',
      'Pick a fix and place it on a tile beside the path. It covers the path tiles around it.',
      'A fix stops only the attack it really fixes. Anything else walks past it.',
    ],
    controls: [
      { keys: '1 to 7', does: 'Pick a fix' },
      { keys: 'Arrow keys', does: 'Move the cursor' },
      { keys: 'Enter or Space', does: 'Place the fix' },
      { keys: 'N', does: 'Send the next wave now' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [1200, 2400, 3400],
    seconds: 110,
    board: [
      'The grid is the app. Attacks come in from the internet at the top and walk down two routes to the database at the bottom.',
      'Each attack is a shape with a label (SQLi, XSS, IDOR, CMDi, SSRF, Mass): a kind of attack, not a person.',
      'Fixes are tiles you place next to a route. A fix covers the route tiles around it and stops exactly one kind of attack that walks past, nothing else.',
      'Data leaked, at the top, rises each time an attack reaches the database. At 100% the run is over.',
    ],
    rules: [
      {
        title: 'Which fix stops which attack',
        items: [
          { label: 'SQLi → Params', text: 'A parameterised query hands the input to the database as data, never as instructions.' },
          { label: 'XSS → Escape', text: 'Escaping turns what a user typed into harmless text before it goes on the page.' },
          { label: 'IDOR → Owner', text: 'An ownership check makes sure the record belongs to the person asking.' },
          { label: 'CMDi → Args', text: 'execFile with an argument list runs the program with no shell to read the input.' },
          { label: 'SSRF → URLs', text: 'A URL allow-list lets the server fetch only from a fixed list of hosts.' },
          { label: 'Mass → Fields', text: 'A field allow-list saves only the fields you expect, never a role or a price.' },
          { label: 'WAF', text: 'Slows every attack a little and stops none of them. Cheap help, never a fix.' },
        ],
      },
    ],
    words: ['sqli', 'param-query', 'xss', 'escape', 'idor', 'owner-check', 'cmdi', 'shell', 'ssrf', 'allow-list', 'mass-assign', 'waf'],
  },
  {
    id: 'network-sweeper',
    zone: 'perimeter',
    title: 'Network Sweeper',
    tagline: 'Find the weak host before the attacker does',
    teaches: 'Recon in order: find live hosts, then ports, then versions, then the CVE, and trust a banner over a scanner guess.',
    speaker: 'Ines',
    line: "Harbor's network again, and someone else is scanning it right now. Find the weak machine first, and stay inside the scope we signed.",
    howTo: [
      'The grid is the network. Ping a block to see which hosts are up.',
      'Port scan a host, check its version, then look the version up.',
      'Flag every vulnerable host before the attacker bar fills. Leave the hatched area alone.',
    ],
    controls: [
      { keys: 'Arrow keys', does: 'Move between hosts' },
      { keys: '1 to 4', does: 'Ping, ports, version, look up' },
      { keys: 'F', does: 'Flag as vulnerable' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [500, 1000, 1300],
    seconds: 100,
    board: [
      'The grid is Harbor\'s network: each square is one address that may or may not have a machine on it.',
      'The hatched squares are outside the scope the client signed. Touching them speeds the attacker up and costs points.',
      'The attacker bar fills on its own. Flag every vulnerable machine before it reaches 100%.',
      'Each tool has a few uses, shown on its button. Spend them in order: ping, ports, version, look up.',
    ],
    rules: [
      {
        title: 'The order that works',
        items: [
          { label: '1. Ping sweep', text: 'Shows which machines in a 3 by 3 block are up. Empty squares have nothing to test.' },
          { label: '2. Port scan', text: 'Lists the open ports on one machine and the scanner\'s guess at what runs there. A "Possible CVE" is only a guess.' },
          { label: '3. Version check', text: 'Reads the banner: the real program and version. Trust this over the scanner\'s guess.' },
          { label: '4. CVE lookup', text: 'Checks that exact version against known flaws. "CVE match" means flag it.' },
        ],
      },
      {
        title: 'What costs you',
        items: [
          { label: 'Out of scope', text: 'Any tool on a hatched square.' },
          { label: 'Flagging on a guess', text: 'A flag on a machine whose real version is patched.' },
        ],
      },
    ],
    words: ['ip', 'host', 'ping', 'port', 'port-scan', 'service', 'banner', 'version', 'cve', 'scope', 'scanner', 'false-positive'],
  },
  {
    id: 'lockdown',
    zone: 'cloud',
    title: 'Lockdown',
    tagline: 'Close every attacker path, keep every user working',
    teaches: 'Least privilege across firewall rules, bucket policies and roles: assume a server will be broken into, and make sure that gets the attacker nothing.',
    speaker: 'Yasmin',
    line: "Lantern's account, one diagram at a time. Close every way in for the attacker without locking out the people who work there.",
    howTo: [
      'Red lines are routes the attacker has. Green lines are people who need access.',
      'Change a rule: tap it and pick a setting, or drag a setting from the tray onto it.',
      'Clear each diagram in as few changes as you can. The clock runs for the whole set.',
    ],
    controls: [
      { keys: 'Tab and Enter', does: 'Pick a rule' },
      { keys: '1 to 4', does: 'Choose a setting' },
      { keys: 'R', does: 'Undo all changes on this diagram' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [600, 1200, 1700],
    seconds: 120,
    board: [
      'Each diagram is part of Lantern\'s cloud account. Three columns: who is trying to get in, the servers, and the data they want.',
      'Red lines are routes the attacker has right now. Green lines are people or programs that need access to do their job. Each card says in words who can reach it.',
      'The rules in between decide every line: firewall rules (which networks may connect), bucket policies (who may read the files) and the role a server runs as (what a program on it may do).',
      '"Attacker in the shop" means the web shop is assumed broken into. Whatever the shop server is allowed to reach, the attacker reaches too.',
      'A diagram is done when no red line is left and every green line still works. Par is the fewest changes that do it.',
    ],
    rules: [
      {
        title: 'The settings',
        items: [
          { label: 'Firewall: Anyone / Office only / Inside only / Closed', text: 'Who may connect: the whole internet, only the office network, only other servers inside, or nobody.' },
          { label: 'Bucket policy', text: 'Which roles may read the files: Public means anyone at all; "No one" closes it completely.' },
          { label: 'Runs as', text: 'The role a server\'s program uses. Give it only the role its own job needs.' },
        ],
      },
    ],
    words: ['firewall', 'bucket', 'policy', 'iam', 'least-privilege', 'ci', 'foothold'],
  },
  {
    id: 'triage-rush',
    zone: 'report',
    title: 'Triage Rush',
    tagline: 'Rank each finding before the next one lands',
    teaches: 'How severity follows from the facts: who can reach it, whether a login or a click is needed, and what it exposes.',
    speaker: 'Ines',
    line: "Claire wants every finding ranked before her board meeting. Quick and right: her developers will fix them in this order.",
    howTo: [
      'Findings arrive one at a time with the evidence that matters.',
      'Set the severity before its timer runs out. Right answers in a row build a streak.',
      'For a bonus, first pick the fact that drives the score.',
    ],
    controls: [
      { keys: '1 to 4', does: 'Low, Medium, High, Critical' },
      { keys: 'Q, W, E', does: 'Pick the driver (bonus)' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [900, 1800, 2700],
    seconds: 90,
    board: [
      'Each card is one finding from the case: what is wrong, where, and the facts about who can reach it.',
      'Pick its severity (Low, Medium, High or Critical) before its timer bar runs out.',
      'For a bonus, first pick the one fact that drives the score most. Two of the three choices are decoys.',
      'At the end you see every finding you misjudged, with the right severity and why.',
    ],
    rules: [
      {
        title: 'How severity follows from the facts',
        items: [
          { label: 'Critical', text: 'Anyone on the internet, no login, no click needed, and it exposes or breaks a lot.' },
          { label: 'High', text: 'Reachable from the internet with serious damage, but needs a normal login, or one strong condition.' },
          { label: 'Medium', text: 'Needs a victim to click, a login and only some data, or the same network.' },
          { label: 'Low', text: 'Needs the device in hand or an account on the machine, or exposes very little.' },
        ],
      },
      {
        title: 'The facts that move it',
        items: [
          { label: 'Where from (AV)', text: 'The internet is worse than the same network, which is worse than the machine itself.' },
          { label: 'Login needed (PR)', text: 'No login at all is worse than a normal account, which is worse than an admin.' },
          { label: 'Click needed (UI)', text: 'If a victim has to click something, it goes down a step.' },
          { label: 'What it exposes', text: 'Reading or changing everything is worse than reading a little.' },
        ],
      },
    ],
    words: ['finding', 'severity', 'cvss', 'cvss-av', 'cvss-ac', 'cvss-pr', 'cvss-ui', 'cia'],
  },
];

export const ARCADE_BY_ID = Object.fromEntries(ARCADE.map((g) => [g.id, g])) as Record<GameId, ArcadeGame>;
export const ARCADE_BY_ZONE = Object.fromEntries(ARCADE.map((g) => [g.zone, g])) as Record<ZoneId, ArcadeGame>;
