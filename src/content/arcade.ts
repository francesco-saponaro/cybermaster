// The five arcade games: one bonus round per zone, opened by the zone's boss.
// What each one is called, who sends you in, how to play it, and the scores
// its stars need.

import type { ZoneId } from './types';
import type { Speaker } from './story';

export type GameId = 'spot-the-forgery' | 'tower-defence' | 'network-sweeper' | 'lockdown' | 'triage-rush' | 'fix-first';

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
  /** How to play on a touch screen, when it is not the buttons under the board. */
  touch?: string;
}

export const ARCADE: ArcadeGame[] = [
  {
    id: 'spot-the-forgery',
    zone: 'wire',
    title: 'Spot the Forgery',
    tagline: 'Two requests, one is fake. Which one?',
    teaches: 'Telling a real request from a forged one: an edited cookie, an unsigned or expired token, a foreign or lookalike Origin, a copied session, a missing login.',
    speaker: 'Bruno',
    line: "These came in on Monday night in pairs: the customer's real request, and the attacker's copy with one line changed. Tell me which is which.",
    howTo: [
      'Each round shows the same request twice, side by side. One is real, one was changed by the attacker.',
      'Click or tap the forged one before the round clock runs out. You then see the line that gave it away and why.',
      'Twelve rounds, getting harder. A wrong pick or running out of time costs one of three lives.',
    ],
    controls: [
      { keys: 'Left arrow or 1', does: 'Card A is forged' },
      { keys: 'Right arrow or 2', does: 'Card B is forged' },
      { keys: 'Enter or Space', does: 'Next round' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [800, 1800, 3000],
    seconds: 120,
    touch: 'On a touch screen, tap the card you think is forged.',
    board: [
      'Two cards, A and B, show the same request arriving at the shop: what it asks for, and the proof it carries (a cookie, a token, where it came from).',
      'Line by line they are identical except where the attacker changed something. Find the line that differs, then decide which version is the attack.',
      'From round 9 the cards differ in two lines: one harmless (another customer\'s session id, a different expiry time) and one that is the attack. Only one of them matters.',
      'The bar under the question is the round clock. It stops while the answer is explained, so take your time reading.',
    ],
    rules: [
      {
        title: 'The forged card is the one with',
        items: [
          { label: 'A role in a cookie', text: 'Cookie: role=admin. The browser keeps cookies, so anyone can type one. Roles come from the server.' },
          { label: 'No login', text: 'No cookie on a private page. Knowing the address, even from robots.txt, is not permission.' },
          { label: 'The wrong person', text: 'A real session, but the server says it belongs to a customer and it wants a staff page.' },
          { label: 'alg: none', text: 'A token that says it has no signature, so anyone could have written it.' },
          { label: 'A broken signature', text: '"Does not match": the token was edited after it was signed.' },
          { label: 'An expiry in the past', text: 'Yesterday, or two minutes ago: expired is expired.' },
          { label: 'Another website as Origin', text: 'evil.example, a lookalike like shop-lantern.example or shop.lantern.example.pay-check.io, or http:// instead of https://.' },
          { label: 'A session in two places', text: 'The same session id in use from another city at the same moment: it was copied.' },
        ],
      },
      {
        title: 'Harmless differences',
        items: [
          { label: 'Different session ids', text: 'Every customer has their own. A different id alone is normal.' },
          { label: 'Different expiry times', text: 'Tokens are issued at different moments. Only one in the past matters.' },
          { label: 'Small extras', text: 'A language setting or a theme cookie changes nothing about who you are.' },
        ],
      },
    ],
    words: ['get', 'post', 'delete', 'options', 'cookie', 'sid', 'role-cookie', 'robots', 'token', 'alg', 'hs256', 'alg-none', 'signature', 'exp', 'origin', 'https', 'replay'],
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
  {
    id: 'fix-first',
    zone: 'scanner',
    title: 'Fix First',
    tagline: 'Two real results, one patch window. Which goes first?',
    teaches: 'Prioritising scan results: severity first, then proof over guesses, then who can reach the machine and what it holds.',
    speaker: 'Ines',
    line: "Monday morning, the weekly report is in and Claire's team can patch one thing before lunch. Pick it, every time.",
    howTo: [
      'Each round shows two real results from the scans. Both need fixing; you choose which comes first.',
      'Click or tap the one to fix first before the round clock runs out. You then see why.',
      'Twelve rounds, getting harder. A wrong call or running out of time costs one of three lives.',
    ],
    controls: [
      { keys: 'Left arrow or 1', does: 'Card A first' },
      { keys: 'Right arrow or 2', does: 'Card B first' },
      { keys: 'Enter or Space', does: 'Next round' },
      { keys: 'P or Esc', does: 'Pause' },
    ],
    stars: [800, 1800, 3000],
    seconds: 120,
    touch: 'On a touch screen, tap the card to fix first.',
    board: [
      'Two cards, A and B, are two results from Lantern\'s OpenVAS reports.',
      'Each card shows the finding, the host, its score (severity), the QoD (how sure the scanner is) and who can reach the machine.',
      'From round 5 the scores are close or equal, so the other lines decide. From round 9 the cards look almost the same: read every line.',
      'The bar under the question is the round clock. It stops while the answer is explained.',
    ],
    rules: [
      {
        title: 'Fix first, in this order',
        items: [
          { label: 'Higher severity', text: 'High (7.0 and up) before Medium (4.0 and up) before Low. Log results are information, not problems.' },
          { label: 'Proof over guesses', text: 'QoD 97% (checked from inside) beats 30% (a version read from a banner that may already be patched). Verify the guess, fix the proof.' },
          { label: 'Who can reach it', text: 'The internet beats the office, and no login needed beats a login needed.' },
          { label: 'What it holds', text: 'Same flaw, same proof: the machine with customer data before the empty test box.' },
          { label: 'Already handled', text: 'A result overridden as a false positive, with a reason, has been dealt with.' },
        ],
      },
    ],
    words: ['gvm-qod-word', 'severity', 'cvss', 'false-positive', 'banner', 'gvm-override-word', 'eol', 'telnet-word'],
  },
];

export const ARCADE_BY_ID = Object.fromEntries(ARCADE.map((g) => [g.id, g])) as Record<GameId, ArcadeGame>;
export const ARCADE_BY_ZONE = Object.fromEntries(ARCADE.map((g) => [g.zone, g])) as Record<ZoneId, ArcadeGame>;
