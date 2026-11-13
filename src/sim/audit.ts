// The audit tools in The Audit: npm audit, Trivy, docker, the AWS CLI's
// CloudTrail commands, Prowler and sshd -T. Their output follows the real
// tools' formats; what they report comes from the level's setup, so the
// challenges can change the findings. npm audit fix changes the project and
// stays changed, replayed from the history like the Linux box.

import type { CommandResult } from './terminal';

export interface NpmVuln {
  pkg: string;
  range: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  ghsa: string;
  /** The package that pulls it in, when it is not a direct dependency. */
  via?: string;
  /** Only used in development (tests, build tools). */
  dev?: boolean;
  /** Needs a breaking upgrade: npm audit fix will not do it. */
  breaking?: string;
  installed: string;
}

export interface TrivyVuln {
  lib: string;
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  installed: string;
  fixed: string;
  title: string;
}

export interface TrailEvent {
  time: string;
  name: string;
  user: string;
  ip: string;
  keyId: string;
  resource?: string;
  detail?: string;
}

export interface ProwlerFinding {
  status: 'FAIL' | 'PASS';
  severity: 'critical' | 'high' | 'medium' | 'low';
  check: string;
  service: string;
  resource: string;
  text: string;
}

export interface AuditSetup {
  project: string;
  npm?: NpmVuln[];
  image?: { name: string; os: string; eol?: boolean; vulns: TrivyVuln[]; node?: TrivyVuln[] };
  dockerfileMisconfig?: { id: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; title: string; message: string }[];
  container?: { name: string; image: string; ports: string; user: string; privileged: boolean };
  trail?: { account: string; events: TrailEvent[]; multiRegion: boolean; dataEvents: boolean; trailName: string };
  prowler?: ProwlerFinding[];
  sshd?: Record<string, string>;
}

const ord = { critical: 0, high: 1, moderate: 2, low: 3 } as const;

// ---- npm audit --------------------------------------------------------------------

export function npm(a: AuditSetup, args: string[], fixed: boolean): CommandResult {
  const [sub, ...rest] = args;
  if (!a.npm) return { out: ['npm ERR! code ENOLOCK', 'npm ERR! This command requires an existing lockfile.'], facts: [] };
  const live = a.npm.filter((v) => !(fixed && !v.breaking));
  if (sub === 'ls' || sub === 'list') {
    const name = rest.find((x) => !x.startsWith('-'));
    if (!name) return { out: [`${a.project}@1.4.0 /home/analyst/${a.project}`, '├── express@4.18.2', '├── node-fetch@2.6.1', '└── lodash@4.17.20'], facts: ['npm-ls'] };
    const v = a.npm.find((x) => x.pkg === name);
    if (!v) return { out: [`${a.project}@1.4.0 /home/analyst/${a.project}`, '└── (empty)'], facts: [`npm-ls:${name}`] };
    const ver = fixed && !v.breaking ? v.installed.replace(/\d+$/, (d) => String(Number(d) + 1)) : v.installed;
    return {
      out: v.via ? [`${a.project}@1.4.0 /home/analyst/${a.project}`, `└─┬ ${v.via}${v.dev ? ' (dev)' : ''}`, `  └── ${v.pkg}@${ver}`] : [`${a.project}@1.4.0 /home/analyst/${a.project}`, `└── ${v.pkg}@${ver}`],
      facts: [`npm-ls:${name}`],
    };
  }
  if (sub !== 'audit') return { out: [`Unknown command: "${sub ?? ''}". Try npm audit or npm ls <package>.`], facts: [] };
  if (rest[0] === 'fix') {
    if (rest.includes('--force')) return { out: ['npm WARN using --force Recommended protections disabled.', '(not done: --force installs breaking major versions; on a client project, agree that with the developers first)'], facts: [], fail: 'npm audit fix --force can break the app with major upgrades. Run plain npm audit fix and report what is left.' };
    const n = a.npm.filter((v) => !v.breaking).length;
    return { out: [`changed ${n + 2} packages, and audited 412 packages in 3s`, '', fixed ? 'up to date' : `fixed ${n} of ${a.npm.length} vulnerabilities in 412 scanned packages`, ...(a.npm.some((v) => v.breaking) ? [`  ${a.npm.filter((v) => v.breaking).length} vulnerabilit${a.npm.filter((v) => v.breaking).length === 1 ? 'y requires' : 'ies require'} manual review. See the full report for details.`] : [])], facts: ['npm-fixed'], delay: 600 };
  }
  const prodOnly = rest.includes('--omit=dev') || rest.includes('--production') || rest.includes('--omit') && rest.includes('dev');
  const list = live.filter((v) => !(prodOnly && v.dev)).sort((x, y) => ord[x.severity] - ord[y.severity]);
  const facts = ['npm-audit', prodOnly ? 'npm-audit:prod' : 'npm-audit:all'];
  if (!list.length) return { out: ['found 0 vulnerabilities'], facts: [...facts, prodOnly ? 'npm-prod-clean' : 'npm-clean'] };
  const out = ['# npm audit report', ''];
  for (const v of list) {
    out.push(`${v.pkg}  ${v.range}`, `Severity: ${v.severity}`, `${v.title} - https://github.com/advisories/${v.ghsa}`);
    out.push(v.breaking ? `fix available via \`npm audit fix --force\`` : 'fix available via `npm audit fix`');
    if (v.breaking) out.push(`Will install ${v.breaking}, which is a breaking change`);
    out.push(`node_modules/${v.pkg}`);
    if (v.via) out.push(`  ${v.via.split('@')[0]}  *`, `  Depends on vulnerable versions of ${v.pkg}`, `  node_modules/${v.via.split('@')[0]}`);
    out.push('');
    facts.push(`npm-vuln:${v.pkg}:${v.severity}`);
  }
  const count = (s: string) => list.filter((v) => v.severity === s).length;
  const parts = (['low', 'moderate', 'high', 'critical'] as const).filter((s) => count(s)).map((s) => `${count(s)} ${s}`);
  out.push(`${list.length} vulnerabilit${list.length === 1 ? 'y' : 'ies'} (${parts.join(', ')})`, '');
  out.push(list.some((v) => !v.breaking) ? 'To address all issues possible, run:\n  npm audit fix' : 'To address all issues (including breaking changes), run:\n  npm audit fix --force');
  return { out: out.flatMap((l) => l.split('\n')), facts };
}

// ---- Trivy --------------------------------------------------------------------------------

export function trivy(a: AuditSetup, args: string[]): CommandResult {
  const [sub, ...rest] = args;
  const sevArg = rest.find((x) => x.startsWith('--severity'));
  const sevI = rest.indexOf('--severity');
  const sev = sevArg?.includes('=') ? sevArg.split('=')[1]! : sevI >= 0 ? rest[sevI + 1] ?? '' : '';
  const keep = (s: string) => !sev || sev.toUpperCase().split(',').includes(s);
  const target = rest.filter((x, i) => !x.startsWith('-') && rest[i - 1] !== '--severity').pop();
  if (sub === 'config') {
    if (!a.dockerfileMisconfig) return { out: ['No misconfigurations found.'], facts: ['trivy-config'] };
    const ms = a.dockerfileMisconfig.filter((m) => keep(m.severity));
    const out = ['', 'Dockerfile (dockerfile)', '=======================', `Tests: 27 (SUCCESSES: ${27 - ms.length}, FAILURES: ${ms.length})`, `Failures: ${ms.length} (${(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((s) => `${s}: ${ms.filter((m) => m.severity === s).length}`).join(', ')})`, ''];
    for (const m of ms) out.push(`${m.id} (${m.severity}): ${m.message}`, '═'.repeat(60), m.title, '', ` Dockerfile:1`, '');
    return { out, facts: ['trivy-config', ...ms.map((m) => `trivy-misconfig:${m.id}`)] };
  }
  if (sub !== 'image') return { out: ['Usage: trivy image [--severity CRITICAL,HIGH] <image>  |  trivy config <dir>'], facts: [] };
  const img = a.image;
  if (!img || !target || (target !== img.name && !img.name.startsWith(target))) return { out: [`FATAL Fatal error  unable to find the specified image "${target ?? ''}"`], facts: [] };
  const vs = img.vulns.filter((v) => keep(v.severity));
  const total = (list: TrivyVuln[]) => `Total: ${list.length} (${(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((s) => `${s}: ${list.filter((v) => v.severity === s).length}`).join(', ')})`;
  const out = ['2026-11-11T10:02:41Z\tINFO\tDetected OS\tfamily="debian" version="' + img.os.split(' ')[1] + '"'];
  if (img.eol) out.push(`2026-11-11T10:02:41Z\tWARN\tThis OS version is no longer supported by the distribution\tfamily="debian" version="${img.os.split(' ')[1]}"`, '2026-11-11T10:02:41Z\tWARN\tThe vulnerability detection may be insufficient because security updates are not provided');
  out.push('', `${img.name} (${img.os})`, '='.repeat(img.name.length + img.os.length + 3), total(vs), '');
  const row = (v: TrivyVuln) => `${v.lib.padEnd(14)} ${v.id.padEnd(16)} ${v.severity.padEnd(9)} fixed     ${v.installed.padEnd(20)} ${v.fixed.padEnd(20)} ${v.title}`;
  out.push(`${'Library'.padEnd(14)} ${'Vulnerability'.padEnd(16)} ${'Severity'.padEnd(9)} Status    ${'Installed Version'.padEnd(20)} ${'Fixed Version'.padEnd(20)} Title`);
  out.push(...vs.map(row));
  if (img.node?.length) {
    const nv = img.node.filter((v) => keep(v.severity));
    out.push('', 'Node.js (node-pkg)', '==================', total(nv), '', ...nv.map(row));
  }
  return { out, facts: ['trivy-image', `trivy-image:${img.name}`, ...vs.map((v) => `trivy-vuln:${v.id}`)], delay: 800 };
}

// ---- docker -------------------------------------------------------------------------------

export function docker(a: AuditSetup, args: string[]): CommandResult {
  const c = a.container;
  const [sub, ...rest] = args;
  if (!c) return { out: ['Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?'], facts: [] };
  if (sub === 'ps') return { out: ['CONTAINER ID   IMAGE             COMMAND                  STATUS        PORTS                    NAMES', `3f9a1c22e8b4   ${c.image.padEnd(17)} "docker-entrypoint.s…"   Up 4 days     ${c.ports.padEnd(24)} ${c.name}`], facts: ['docker-ps'] };
  if (sub === 'inspect') {
    if (rest[0] !== c.name) return { out: [`Error: No such object: ${rest[0] ?? ''}`], facts: [] };
    return {
      out: ['[', '    {', `        "Name": "/${c.name}",`, '        "Config": {', `            "User": "${c.user}",`, `            "Image": "${c.image}",`, '            "ExposedPorts": { "3000/tcp": {} }', '        },', '        "HostConfig": {', `            "Privileged": ${c.privileged},`, `            "PortBindings": { "3000/tcp": [ { "HostIp": "${c.ports.split(':')[0]}", "HostPort": "3000" } ] }`, '        }', '    }', ']'],
      facts: ['docker-inspect', `docker-user:${c.user || 'root'}`, ...(c.privileged ? ['docker-privileged'] : [])],
    };
  }
  return { out: ['Usage: docker ps | docker inspect <container>'], facts: [] };
}

// ---- AWS CLI: CloudTrail and STS -------------------------------------------------------------

function attr(args: string[]): { name: string; value: string } | null {
  const i = args.indexOf('--lookup-attributes');
  const raw = i >= 0 ? args[i + 1] : args.find((x) => x.startsWith('--lookup-attributes='))?.slice(20);
  if (!raw) return null;
  const m = /AttributeName=(\w+),AttributeValue=(.+)/.exec(raw);
  return m ? { name: m[1]!, value: m[2]! } : null;
}

export function aws(a: AuditSetup, args: string[]): CommandResult {
  const [svc, sub, ...rest] = args;
  const t = a.trail;
  if (svc === 'sts' && sub === 'get-caller-identity') return { out: ['{', '    "UserId": "AIDAEXAMPLEAUDITOR01",', `    "Account": "${t?.account ?? '111122223333'}",`, `    "Arn": "arn:aws:iam::${t?.account ?? '111122223333'}:user/watch-auditor"`, '}'], facts: ['aws-whoami'] };
  if (svc !== 'cloudtrail' || !t) return { out: ['usage: aws cloudtrail lookup-events | describe-trails | get-event-selectors --trail-name <name>', '       aws sts get-caller-identity'], facts: [] };
  if (sub === 'describe-trails') return { out: ['{', '    "trailList": [', '        {', `            "Name": "${t.trailName}",`, `            "S3BucketName": "lantern-cloudtrail-logs",`, `            "IsMultiRegionTrail": ${t.multiRegion},`, '            "HomeRegion": "eu-west-3",', '            "LogFileValidationEnabled": false', '        }', '    ]', '}'], facts: ['aws-trails', t.multiRegion ? 'aws-trail:multi' : 'aws-trail:single'] };
  if (sub === 'get-event-selectors') return { out: ['{', `    "TrailARN": "arn:aws:cloudtrail:eu-west-3:${t.account}:trail/${t.trailName}",`, '    "EventSelectors": [', '        {', '            "ReadWriteType": "All",', '            "IncludeManagementEvents": true,', `            "DataResources": [${t.dataEvents ? ' { "Type": "AWS::S3::Object", "Values": ["arn:aws:s3"] } ' : ''}]`, '        }', '    ]', '}'], facts: ['aws-selectors', t.dataEvents ? 'aws-data-events:on' : 'aws-data-events:off'] };
  if (sub !== 'lookup-events') return { out: [`aws: error: argument operation: Invalid choice: '${sub ?? ''}'`], facts: [] };
  const q = attr(rest);
  if (!q) return { out: ['Add a filter, like --lookup-attributes AttributeName=EventName,AttributeValue=CreateAccessKey'], facts: [] };
  const field: Record<string, (e: TrailEvent) => string> = { EventName: (e) => e.name, Username: (e) => e.user, AccessKeyId: (e) => e.keyId, ResourceName: (e) => e.resource ?? '' };
  const f = field[q.name];
  if (!f) return { out: [`An error occurred (InvalidLookupAttributesException): ${q.name} is not a lookup attribute. Use EventName, Username, AccessKeyId or ResourceName.`], facts: [] };
  const hits = t.events.filter((e) => f(e) === q.value);
  const out = ['{', '    "Events": ['];
  hits.forEach((e, i) => {
    out.push(
      '        {',
      `            "EventName": "${e.name}",`,
      `            "EventTime": "${e.time}",`,
      `            "Username": "${e.user}",`,
      `            "AccessKeyId": "${e.keyId}",`,
      `            "SourceIPAddress": "${e.ip}",`,
      ...(e.resource ? [`            "Resources": [ { "ResourceName": "${e.resource}" } ],`] : []),
      ...(e.detail ? [`            "Detail": "${e.detail}",`] : []),
      '            "ReadOnly": "' + (/^(Get|List|Describe)/.test(e.name) ? 'true' : 'false') + '"',
      `        }${i < hits.length - 1 ? ',' : ''}`,
    );
  });
  out.push('    ]', '}');
  return { out, facts: ['aws-lookup', `aws-lookup:${q.name}=${q.value}`, ...hits.map((e) => `trail:${e.name}:${e.user}:${e.ip}`)] };
}

// ---- Prowler ----------------------------------------------------------------------------------

export function prowler(a: AuditSetup, args: string[]): CommandResult {
  if (args[0] !== 'aws') return { out: ['Usage: prowler aws [--severity critical high] [--service s3] [--check <check_id>]'], facts: [] };
  const list = a.prowler ?? [];
  const sevI = args.indexOf('--severity');
  const sevs = sevI >= 0 ? args.slice(sevI + 1).filter((x, i, arr) => !x.startsWith('-') && arr.slice(0, i).every((y) => !y.startsWith('-'))) : [];
  const svcI = args.indexOf('--service');
  const svc = svcI >= 0 ? args[svcI + 1] : undefined;
  const chkI = args.indexOf('--check');
  const chk = chkI >= 0 ? args[chkI + 1] : undefined;
  const shown = list.filter((f) => (!sevs.length || sevs.includes(f.severity)) && (!svc || f.service === svc) && (!chk || f.check === chk));
  const out = ['', '                         _', ' _ __  _ __ _____      _| | ___ _ __', '| \'_ \\| \'__/ _ \\ \\ /\\ / / |/ _ \\ \'__|', '| |_) | | | (_) \\ V  V /| |  __/ |', '| .__/|_|  \\___/ \\_/\\_/ |_|\\___|_|v5.12.2', '|_|', '', '-> Using the AWS credentials below:', '  · AWS-CLI Profile: default', '  · AWS Regions: all', '  · AWS Account: 111122223333', '  · User Id: AIDAEXAMPLEAUDITOR01', '', `-> Using the following filters: ${[sevs.length ? `severity ${sevs.join(', ')}` : '', svc ? `service ${svc}` : '', chk ? `check ${chk}` : ''].filter(Boolean).join('; ') || 'none'}`, ''];
  for (const f of shown.sort((x, y) => (x.status === y.status ? 0 : x.status === 'FAIL' ? -1 : 1) || ord[x.severity === 'medium' ? 'moderate' : x.severity] - ord[y.severity === 'medium' ? 'moderate' : y.severity])) {
    out.push(`  ${f.status === 'FAIL' ? 'FAIL' : 'PASS'}  ${f.severity.padEnd(8)} ${f.check}`, `        ${f.resource}: ${f.text}`);
  }
  const fail = shown.filter((f) => f.status === 'FAIL').length;
  const pass = shown.length - fail;
  const pct = (n: number) => (shown.length ? ((n / shown.length) * 100).toFixed(2) : '0.00');
  out.push('', 'Overview Results:', `  ${pct(fail)}% (${fail}) Failed`, `  ${pct(pass)}% (${pass}) Passed`, '', 'Detailed results are in output/prowler-output-111122223333-20261111.csv, .json and .html');
  return { out, facts: ['prowler-run', ...(sevs.length ? [`prowler-sev:${sevs.join(',')}`] : []), ...(svc ? [`prowler-service:${svc}`] : []), ...shown.filter((f) => f.status === 'FAIL').map((f) => `prowler-fail:${f.check}`)], delay: 1000 };
}

// ---- sshd -T ------------------------------------------------------------------------------------

export function sshdT(a: AuditSetup, args: string[], root: boolean): CommandResult {
  if (args[0] !== '-T') return { out: ['usage: sshd -T   (prints the configuration sshd is really using)'], facts: [] };
  if (!root) return { out: ['sshd: no hostkeys available -- exiting.'], facts: [], fail: 'sshd -T reads the host keys, which needs root: put sudo in front.' };
  const c = a.sshd ?? {};
  return { out: Object.entries(c).map(([k, v]) => `${k} ${v}`), facts: ['sshd-T', ...Object.entries(c).map(([k, v]) => `sshd:${k}:${v}`)] };
}
