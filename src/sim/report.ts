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

/** What the client says about each field: a check per field, with their words when it falls short. */
export function readFinding(d: FindingDraft): Check[] {
  const t = d.title.toLowerCase();
  const a = d.asset.toLowerCase();
  const desc = d.description.toLowerCase();
  const imp = d.impact.toLowerCase();
  const fix = d.fix.toLowerCase();
  const sentences = d.description.split(/[.!?](\s|$)/).filter((s) => s && s.trim().split(/\s+/).length >= 3).length;

  const titleOk = has(t, ['sql injection', 'sqli', /sql\s*-?\s*injection/]) && has(t, ['login', 'sign-in', 'sign in']);
  const assetOk = has(a, ['/login']) && has(a, ['lantern', 'shop', 'post']);
  const sevOk = d.vector === FINDING_TARGET_VECTOR;
  const descOk = sentences >= 2 && has(desc, ['name']) && has(desc, ['query', 'sql']);
  const impactOk = has(imp, ['admin', 'account', 'customer', 'data', 'record', 'order', 'user']) && has(imp, ['log in', 'login', 'read', 'change', 'modify', 'access', 'take over', 'export', 'edit', 'delete']);
  const proof = d.evidence.includes('ev-sqli-request');
  const onlyScanner = d.evidence.length > 0 && d.evidence.every((e) => e === 'ev-scanner-sqli');
  const evidenceOk = proof;
  const fixParam = has(fix, ['parameter', 'prepared', 'placeholder', 'bind']);
  const fixBandage = has(fix, ['waf', 'firewall', 'blacklist', 'blocklist', 'filter', 'escape', 'sanitis', 'sanitiz']) && !fixParam;

  return [
    { id: 'title', pass: titleOk, detail: titleOk ? 'I know what is broken and where.' : "I can't tell from the title what is broken or where. Name the flaw and the page." },
    { id: 'asset', pass: assetOk, detail: assetOk ? 'I can find the exact endpoint.' : 'Which system? Give me the host and the endpoint, like POST https://shop.lantern.example/login.' },
    {
      id: 'severity',
      pass: sevOk,
      detail: sevOk ? 'The score matches what you describe.' : 'This score does not match the evidence: no account is needed, nobody has to click anything, and the database can be read and changed.',
    },
    {
      id: 'description',
      pass: descOk,
      detail: descOk ? 'I understand how it works.' : sentences < 2 ? 'Two or three sentences, please: which input, and what it does to the query.' : 'Which field is it, and what happens to the SQL query? Name the name field and the query.',
    },
    { id: 'impact', pass: impactOk, detail: impactOk ? 'I see what we stand to lose.' : 'So what? Tell me what an attacker gets: whose accounts, which data, read or change.' },
    {
      id: 'evidence',
      pass: evidenceOk,
      detail: evidenceOk ? 'I can reproduce it from your evidence.' : onlyScanner ? 'A scanner line is not proof. Attach the request and response that show it working.' : 'Attach the evidence that proves it: the request you sent and what came back.',
    },
    {
      id: 'fix',
      pass: fixParam,
      detail: fixParam ? 'My developers know what to change.' : fixBandage ? 'A filter is a bandage that the next quote trick gets past. Tell us to use parameterised queries.' : 'What exactly do we change? Name the fix a developer can apply and check.',
    },
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
  if (slot < a.phase && placed[0] === null && a.phase > 0) {
    return { ok: false, reason: `Nothing is signed yet. ${a.consequence}` };
  }
  return { ok: false, reason: a.consequence };
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
    const err = e instanceof YamlError ? `Line ${e.line}: ${e.message}` : 'The file could not be read.';
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
  let targetDetail = 'ZAP has no target: add -t http://<juice service>:3000 to its command.';
  if (target) {
    try {
      const u = new URL(target);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') targetDetail = 'Inside the ZAP container, localhost is ZAP itself. Point it at the Juice Shop service by name.';
      else if (u.hostname !== juiceName) targetDetail = `There is no service called "${u.hostname}" in this file.`;
      else if ((u.port || '80') !== '3000') targetDetail = 'Juice Shop listens on port 3000 inside its container.';
      else {
        targetOk = true;
        targetDetail = `ZAP scans ${target}.`;
      }
    } catch {
      targetDetail = `"${target}" is not a URL.`;
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
      { id: 'juice', pass: !!juice, detail: juice ? `Juice Shop runs as "${juiceName}".` : 'No service runs the bkimminich/juice-shop image.' },
      {
        id: 'local',
        pass: !!juice && hasLocal && !exposed,
        detail: exposed ? `"${exposed}" publishes Juice Shop on every network card. Bind it to 127.0.0.1.` : hasLocal ? 'Only this machine can reach Juice Shop.' : 'Publish port 3000 on 127.0.0.1, like "127.0.0.1:3000:3000".',
      },
      { id: 'zap', pass: !!zap, detail: zap ? `ZAP runs as "${zapName}".` : 'No service runs the ZAP image (ghcr.io/zaproxy/zaproxy:stable).' },
      { id: 'target', pass: targetOk, detail: targetDetail },
      { id: 'network', pass: shared, detail: shared ? 'Both containers share a network.' : 'The two services are on different networks, so ZAP cannot reach Juice Shop.' },
    ],
  };
}
