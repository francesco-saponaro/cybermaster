// The attacks and fixes in Hold the Line, and which fix stops which attack.
// The attacks are named by category only: no input that would actually work.

export type AttackId = 'sqli' | 'xss' | 'idor' | 'cmdi' | 'ssrf' | 'mass';
export type FixId = 'params' | 'escape' | 'owner' | 'args' | 'urls' | 'fields' | 'waf';

export interface Attack {
  id: AttackId;
  name: string;
  /** The label on the unit. */
  short: string;
  /** Why only its own fix stops it, in one line. */
  why: string;
}

export interface Fix {
  id: FixId;
  name: string;
  /** The label on the tile. */
  short: string;
  cost: number;
  /** The one attack it stops, or none for the WAF. */
  stops: AttackId | null;
  what: string;
}

export const ATTACKS: Attack[] = [
  { id: 'sqli', name: 'SQL injection', short: 'SQLi', why: 'Only a parameterised query keeps the input out of the SQL text.' },
  { id: 'xss', name: 'Cross-site scripting', short: 'XSS', why: 'Only escaping the output stops the page from running what a user typed.' },
  { id: 'idor', name: 'Insecure direct object reference', short: 'IDOR', why: 'Only an ownership check stops one user reading another user’s record.' },
  { id: 'cmdi', name: 'Command injection', short: 'CMDi', why: 'Only execFile with an argument list keeps the input away from the shell.' },
  { id: 'ssrf', name: 'Server-side request forgery', short: 'SSRF', why: 'Only an allow-list of hosts stops the server fetching addresses it should never reach.' },
  { id: 'mass', name: 'Mass assignment', short: 'Mass', why: 'Only picking the allowed fields stops a request from setting its own role or price.' },
];

export const FIXES: Fix[] = [
  { id: 'params', name: 'Parameterised query', short: 'Params', cost: 50, stops: 'sqli', what: 'Sends the input to the database apart from the SQL.' },
  { id: 'escape', name: 'Output escaping', short: 'Escape', cost: 40, stops: 'xss', what: 'Encodes what users typed before it goes into the page.' },
  { id: 'owner', name: 'Ownership check', short: 'Owner', cost: 40, stops: 'idor', what: 'Checks the record belongs to the user asking for it.' },
  { id: 'args', name: 'execFile with an argument list', short: 'Args', cost: 50, stops: 'cmdi', what: 'Runs the program directly, with no shell to interpret the input.' },
  { id: 'urls', name: 'URL allow-list', short: 'URLs', cost: 50, stops: 'ssrf', what: 'Lets the server fetch only from hosts on a fixed list.' },
  { id: 'fields', name: 'Field allow-list', short: 'Fields', cost: 40, stops: 'mass', what: 'Copies only the named fields from the request body.' },
  { id: 'waf', name: 'Web application firewall', short: 'WAF', cost: 30, stops: null, what: 'Slows every attack that passes it. It stops none of them.' },
];

export const ATTACK_BY_ID = Object.fromEntries(ATTACKS.map((a) => [a.id, a])) as Record<AttackId, Attack>;
export const FIX_BY_ID = Object.fromEntries(FIXES.map((f) => [f.id, f])) as Record<FixId, Fix>;

/** Does this fix stop this attack? Exactly one fix stops each attack, and the WAF stops none. */
export function stops(fix: FixId, attack: AttackId): boolean {
  return FIX_BY_ID[fix].stops === attack;
}

/** Why an attack walked past a fix, in one line for the player. */
export function passWhy(fix: FixId, attack: AttackId): string {
  const f = FIX_BY_ID[fix];
  const a = ATTACK_BY_ID[attack];
  if (fix === 'waf') return `The WAF slowed the ${a.short} attack, but a firewall rule cannot fix the code behind it. ${a.why}`;
  return `${f.name} does nothing against ${a.name.toLowerCase()}. ${a.why}`;
}
