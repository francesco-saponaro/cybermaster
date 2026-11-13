// The Report zone's judges: the client who reads your finding, the order of an
// engagement, and the lab you wire together with a compose file.

import type { Check } from './cloud';

// ---- The finding and the client who reads it --------------------------------

export interface FindingDraft {
  title: string;
  asset: string;
  vector: string;
  description: string;
  impact: string;
  evidence: string[];
  fix: string;
}

export const FINDING_FIELDS = ['title', 'asset', 'severity', 'description', 'impact', 'evidence', 'fix'] as const;
export type FindingField = (typeof FINDING_FIELDS)[number];

export const FINDING_TARGET_VECTOR = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N';

const has = (text: string, words: (string | RegExp)[]) => words.some((w) => (typeof w === 'string' ? text.includes(w) : w.test(text)));

/**
 * What the client needs to see in each field of one finding: groups of words
 * (one word of every group must appear), the score that matches the evidence,
 * the evidence that proves it, and what they say when a field falls short.
 */
export interface FindingSpec {
  title: (string | RegExp)[][];
  asset: (string | RegExp)[][];
  vector: string;
  description: (string | RegExp)[][];
  impact: (string | RegExp)[][];
  /** Evidence ids that prove it (one is enough), and the scanner line that does not. */
  proof: string[];
  scanner: string;
  fix: (string | RegExp)[];
  bandage: (string | RegExp)[];
  say: {
    title: string;
    asset: string;
    severity: string;
    descriptionWhich: string;
    impact: string;
    scanner: string;
    attach: string;
    bandage: string;
    fix: string;
  };
}

export const SQLI_SPEC: FindingSpec = {
  title: [['sql injection', 'sqli', /sql\s*-?\s*injection/], ['login', 'sign-in', 'sign in']],
  asset: [['/login'], ['lantern', 'shop', 'post']],
  vector: FINDING_TARGET_VECTOR,
  description: [['name'], ['query', 'sql']],
  impact: [
    ['admin', 'account', 'customer', 'data', 'record', 'order', 'user'],
    ['log in', 'login', 'read', 'change', 'modify', 'access', 'take over', 'export', 'edit', 'delete'],
  ],
  proof: ['ev-sqli-request'],
  scanner: 'ev-scanner-sqli',
  fix: ['parameter', 'prepared', 'placeholder', 'bind'],
  bandage: ['waf', 'firewall', 'blacklist', 'blocklist', 'filter', 'escape', 'sanitis', 'sanitiz'],
  say: {
    title: "I can't tell from the title what is broken or where. Name the flaw and the page.",
    asset: 'Which system? Give me the host and the endpoint, like POST https://shop.lantern.example/login.',
    severity: 'This score does not match the evidence: no account is needed, nobody has to click anything, and the database can be read and changed. Set Privileges required and User interaction to None, and Confidentiality and Integrity to High.',
    descriptionWhich: 'Which field is it, and what happens to the SQL query? Mention the name field and the query in your sentences.',
    impact: 'So what? Tell me what an attacker gets, like signing in as admin, and which data they can read or change.',
    scanner: 'A scanner line is not proof. Attach "Login bypass: the request and the response" from the locker.',
    attach: 'Attach the evidence that proves it: press Attach on "Login bypass: the request and the response" in the locker.',
    bandage: 'A filter is a bandage that the next quote trick gets past. Tell us to use parameterised queries instead.',
    fix: 'What exactly do we change? Name a fix a developer can apply and check, like parameterised queries.',
  },
};

/** What the client says about each field: a check per field, with their words when it falls short. */
export function readFinding(d: FindingDraft, spec: FindingSpec = SQLI_SPEC): Check[] {
  const t = d.title.toLowerCase();
  const a = d.asset.toLowerCase();
  const desc = d.description.toLowerCase();
  const imp = d.impact.toLowerCase();
  const fix = d.fix.toLowerCase();
  const sentences = d.description.split(/[.!?](\s|$)/).filter((s) => s && s.trim().split(/\s+/).length >= 3).length;
  const all = (text: string, groups: (string | RegExp)[][]) => groups.every((g) => has(text, g));

  const titleOk = all(t, spec.title);
  const assetOk = all(a, spec.asset);
  const sevOk = d.vector === spec.vector;
  const descOk = sentences >= 2 && all(desc, spec.description);
  const impactOk = all(imp, spec.impact);
  const evidenceOk = spec.proof.some((p) => d.evidence.includes(p));
  const onlyScanner = d.evidence.length > 0 && d.evidence.every((e) => e === spec.scanner);
  const fixRight = has(fix, spec.fix);
  const fixBandage = has(fix, spec.bandage) && !fixRight;

  return [
    { id: 'title', pass: titleOk, detail: titleOk ? 'I know what is broken and where.' : spec.say.title },
    { id: 'asset', pass: assetOk, detail: assetOk ? 'I can find the exact endpoint.' : spec.say.asset },
    { id: 'severity', pass: sevOk, detail: sevOk ? 'The score matches what you describe.' : spec.say.severity },
    {
      id: 'description',
      pass: descOk,
      detail: descOk ? 'I understand how it works.' : sentences < 2 ? `Two or three sentences, please: say which input it is, and what it does${spec === SQLI_SPEC ? ' to the query' : ''}.` : spec.say.descriptionWhich,
    },
    { id: 'impact', pass: impactOk, detail: impactOk ? 'I see what we stand to lose.' : spec.say.impact },
    { id: 'evidence', pass: evidenceOk, detail: evidenceOk ? 'I can reproduce it from your evidence.' : onlyScanner ? spec.say.scanner : spec.say.attach },
    { id: 'fix', pass: fixRight, detail: fixRight ? 'My developers know what to change.' : fixBandage ? spec.say.bandage : spec.say.fix },
  ];
}

// ---- Assessment phases --------------------------------------------------------

export interface Artifact {
  id: string;
  label: string;
  detail: string;
  /** Index of the phase it belongs to, 0 to 5. */
  phase: number;
  /** What goes wrong when it is put in the wrong place. */
  consequence: string;
}

export const PHASES = ['Scope and authorisation', 'Reconnaissance', 'Vulnerability assessment', 'Validation', 'Risk and report', 'Remediation and retest'];

/** Placing an artifact in a slot: right, or the consequence of doing it at that point. */
export function placeArtifact(a: Artifact, slot: number, placed: (string | null)[]): { ok: boolean; reason: string } {
  if (a.phase === slot) return { ok: true, reason: '' };
  const tryInstead = slot < a.phase ? 'Try a later phase for it.' : 'Try an earlier phase for it.';
  if (slot < a.phase && placed[0] === null && a.phase > 0) {
    return { ok: false, reason: `Nothing is signed yet. ${a.consequence} ${tryInstead}` };
  }
  return { ok: false, reason: `${a.consequence} ${tryInstead}` };
}

// ---- A small YAML reader for the lab's compose file ---------------------------

export type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml };

export class YamlError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

interface Line {
  indent: number;
  text: string;
  no: number;
}

function scalar(s: string): Yaml {
  const t = s.trim();
  if (t === '') return null;
  if (/^".*"$/.test(t) || /^'.*'$/.test(t)) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^\[.*\]$/.test(t)) {
    const inner = t.slice(1, -1).trim();
    return inner ? inner.split(',').map((x) => scalar(x)) : [];
  }
  return t;
}

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i);
  }
  return s;
}

/** Reads the block style of YAML a compose file uses: maps, lists, scalars, comments. */
export function parseYaml(src: string): Yaml {
  const lines: Line[] = [];
  src.split('\n').forEach((raw, i) => {
    if (/\t/.test(raw.match(/^\s*/)?.[0] ?? '')) throw new YamlError('Use spaces, not tabs, to indent.', i + 1);
    const text = stripComment(raw).replace(/\s+$/, '');
    if (!text.trim()) return;
    lines.push({ indent: text.length - text.trimStart().length, text: text.trim(), no: i + 1 });
  });
  let i = 0;
  function block(indent: number): Yaml {
    const first = lines[i];
    if (!first || first.indent < indent) return null;
    if (first.text.startsWith('- ') || first.text === '-') {
      const list: Yaml[] = [];
      while (i < lines.length && lines[i]!.indent === first.indent && (lines[i]!.text.startsWith('- ') || lines[i]!.text === '-')) {
        const l = lines[i]!;
        const rest = l.text.slice(1).trim();
        i++;
        if (!rest) list.push(block(first.indent + 1));
        else if (/^[^"'\s][^:]*:\s/.test(rest) || /^[^"'\s][^:]*:$/.test(rest)) {
          // a map that starts on the dash line
          lines.splice(i, 0, { indent: first.indent + 2, text: rest, no: l.no });
          list.push(block(first.indent + 2));
        } else list.push(scalar(rest));
      }
      return list;
    }
    const map: Record<string, Yaml> = {};
    while (i < lines.length && lines[i]!.indent === first.indent) {
      const l = lines[i]!;
      if (l.text.startsWith('- ')) throw new YamlError('A list item is mixed in with the keys here.', l.no);
      const m = /^("[^"]+"|'[^']+'|[^:]+):(\s+(.*))?$/.exec(l.text);
      if (!m) throw new YamlError(`Expected "key: value" but found "${l.text}".`, l.no);
      const key = String(scalar(m[1]!));
      i++;
      if (m[3] !== undefined && m[3] !== '') map[key] = scalar(m[3]);
      else if (i < lines.length && lines[i]!.indent > l.indent) map[key] = block(lines[i]!.indent);
      else if (i < lines.length && lines[i]!.indent === l.indent && lines[i]!.text.startsWith('- ')) map[key] = block(l.indent);
      else map[key] = null;
    }
    if (i < lines.length && lines[i]!.indent > first.indent) throw new YamlError('This line is indented more than the lines around it.', lines[i]!.no);
    return map;
  }
  const out = block(0);
  if (i < lines.length) throw new YamlError('This line is indented less than where it started.', lines[i]!.no);
  return out;
}

// ---- The lab ---------------------------------------------------------------

type Svc = { image?: Yaml; ports?: Yaml; command?: Yaml; networks?: Yaml };

const asStrings = (y: Yaml | undefined): string[] => (Array.isArray(y) ? y.map((x) => String(x)) : y === undefined || y === null ? [] : [String(y)]);

export function labChecks(src: string): { valid: boolean; error?: string; checks: Check[]; services: string[] } {
  let doc: Yaml;
  try {
    doc = parseYaml(src);
  } catch (e) {
    const err = e instanceof YamlError ? `Line ${e.line}: ${e.message} Line it up with the example in the step, using two spaces per level.` : 'The file could not be read. Compare it with the example in the step.';
    return { valid: false, error: err, services: [], checks: ['juice', 'local', 'zap', 'target', 'network'].map((id) => ({ id, pass: false, detail: err })) };
  }
  const services = (doc && typeof doc === 'object' && !Array.isArray(doc) ? (doc.services as Record<string, Svc> | undefined) : undefined) ?? {};
  const names = Object.keys(services);
  const juiceName = names.find((n) => /^bkimminich\/juice-shop(:[\w.-]+)?$/.test(String(services[n]?.image ?? '')));
  const zapName = names.find((n) => /^(ghcr\.io\/zaproxy\/zaproxy|zaproxy\/zap-stable|softwaresecurityproject\/zap-stable)(:[\w.-]+)?$/.test(String(services[n]?.image ?? '')));
  const juice = juiceName ? services[juiceName] : undefined;
  const zap = zapName ? services[zapName] : undefined;
  const ports = asStrings(juice?.ports);
  const exposed = ports.find((p) => !/^127\.0\.0\.1:/.test(p) && !/^localhost:/.test(p));
  const hasLocal = ports.some((p) => /^127\.0\.0\.1:\d+:3000$/.test(p));
  const cmd = asStrings(zap?.command).join(' ');
  const target = /-t\s+(\S+)/.exec(cmd)?.[1] ?? '';
  let targetOk = false;
  let targetDetail = 'ZAP has no target: end its command with -t http://juice-shop:3000.';
  if (target) {
    try {
      const u = new URL(target);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') targetDetail = 'Inside the ZAP container, localhost is ZAP itself. Change http://localhost:3000 to http://juice-shop:3000.';
      else if (u.hostname !== juiceName) targetDetail = `There is no service called "${u.hostname}" in this file. Use the Juice Shop service name: http://${juiceName ?? 'juice-shop'}:3000.`;
      else if ((u.port || '80') !== '3000') targetDetail = 'Juice Shop listens on port 3000 inside its container: end the address with :3000.';
      else {
        targetOk = true;
        targetDetail = `ZAP scans ${target}.`;
      }
    } catch {
      targetDetail = `"${target}" is not a URL. Use http://juice-shop:3000.`;
    }
  }
  const nets = (s?: Svc) => {
    const n = s?.networks;
    if (n === undefined || n === null) return ['default'];
    if (Array.isArray(n)) return n.map(String);
    if (typeof n === 'object') return Object.keys(n);
    return [String(n)];
  };
  const shared = juice && zap ? nets(juice).some((n) => nets(zap).includes(n)) : false;
  return {
    valid: true,
    services: names,
    checks: [
      { id: 'juice', pass: !!juice, detail: juice ? `Juice Shop runs as "${juiceName}".` : 'No service runs the bkimminich/juice-shop image. Put the juice-shop service back with image: bkimminich/juice-shop.' },
      {
        id: 'local',
        pass: !!juice && hasLocal && !exposed,
        detail: exposed ? `"${exposed}" publishes Juice Shop to every network this computer is on. Change it to "127.0.0.1:3000:3000".` : hasLocal ? 'Only this machine can reach Juice Shop.' : 'Publish port 3000 on 127.0.0.1: add a ports line - "127.0.0.1:3000:3000" under juice-shop.',
      },
      { id: 'zap', pass: !!zap, detail: zap ? `ZAP runs as "${zapName}".` : 'No service runs the ZAP image. Put the zap service back with image: ghcr.io/zaproxy/zaproxy:stable.' },
      { id: 'target', pass: targetOk, detail: targetDetail },
      { id: 'network', pass: shared, detail: shared ? 'Both containers share a network.' : 'The two services are on different networks, so ZAP cannot reach Juice Shop. Add networks: and - scan under juice-shop, as under zap.' },
    ],
  };
}

// ---- The executive summary ---------------------------------------------------------

export type RiskLevel = 'Critical' | 'High' | 'Medium' | 'Low';
export const RISK_LEVELS: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];

export interface SummaryFinding {
  id: string;
  /** How the technical report names it. */
  title: string;
  /** What it means for the business, in plain words. */
  plain: string;
  severity: RiskLevel;
  /** Being used against the client right now. */
  active?: boolean;
}

export interface SummarySpec {
  audience: string;
  findings: SummaryFinding[];
  overall: RiskLevel;
  top: string[];
  /** Words a board member will not know: each one in the text is flagged. */
  jargon: string[];
  maxWords: number;
  /** The earliest acceptable retest date, YYYY-MM-DD. */
  retestAfter: string;
}

export interface SummaryDraft {
  overall: RiskLevel | '';
  top: string[];
  text: string;
  retest: string;
}

export const EMPTY_SUMMARY: SummaryDraft = { overall: '', top: [], text: '', retest: '' };

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

/** The jargon words a text uses, as written in the spec. */
export function jargonIn(text: string, jargon: string[]): string[] {
  return jargon.filter((j) => new RegExp(`(^|[^\\w-])${j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w-])`, 'i').test(text));
}

const WHO = /\b(customers?|clients?|people|buyers?|shoppers?)\b/i;
const WHAT = /\b(invoices?|addresses|names|emails?|data|records|orders|details)\b/i;
const DOING = /\b(fix|fixed|fixing|close|closed|closing|patch|patched|stop|stopped|block|blocked|lock|locked|remove|removed)\b/i;

/** How Claire, and her board, would read the summary: one check per part. */
export function summaryChecks(d: SummaryDraft, spec: SummarySpec): Check[] {
  const n = words(d.text).length;
  const used = jargonIn(d.text, spec.jargon);
  const top = [...d.top].sort().join(',') === [...spec.top].sort().join(',');
  return [
    { id: 'overall', pass: d.overall === spec.overall, detail: d.overall === spec.overall ? `${spec.overall}: the worst confirmed risk sets the overall level.` : d.overall ? 'The overall level is the worst confirmed risk in the list, not the average.' : 'Pick an overall risk level.' },
    { id: 'top', pass: top, detail: top ? 'The three that hurt the business most, active ones first.' : d.top.length !== 3 ? `Pick exactly three (you have ${d.top.length}).` : 'Not those three: rank by severity, and among equals put what is being used right now first.' },
    { id: 'plain', pass: n >= 30 && n <= spec.maxWords && used.length === 0, detail: n < 30 ? `${n} words: say what happened, what it means and what you are doing, in at least 30.` : n > spec.maxWords ? `${n} words: a board reads ${spec.maxWords} at most.` : used.length ? `Words ${spec.audience} will not know: ${used.join(', ')}.` : `${n} words, no jargon.` },
    { id: 'impact', pass: WHO.test(d.text) && WHAT.test(d.text) && DOING.test(d.text), detail: !WHO.test(d.text) ? 'Say who is affected: customers.' : !WHAT.test(d.text) ? 'Say what of theirs was exposed: invoices, names, addresses.' : !DOING.test(d.text) ? 'Say what is being done: fixed, closed, blocked.' : 'Who, what, and what is being done.' },
    { id: 'retest', pass: /^\d{4}-\d{2}-\d{2}$/.test(d.retest) && d.retest > spec.retestAfter, detail: !d.retest ? 'Set the date you will test the fixes again.' : d.retest <= spec.retestAfter ? 'Too soon: the fixes need a few days. Pick a date after the fix deadline.' : `Retest on ${d.retest}.` },
  ];
}
