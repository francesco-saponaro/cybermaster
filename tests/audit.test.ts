import { describe, expect, it } from 'vitest';
import { execute, type CommandResult, type Network } from '../src/sim/terminal';
import { AUDIT, AUDIT_LEVELS, auditNet, cisNet } from '../src/content/levels/audit';
import { evaluateTerminal } from '../src/game/evaluate';
import { summaryChecks, jargonIn, EMPTY_SUMMARY } from '../src/sim/report';
import { SUMMARY_SPEC, SUMMARY_EXAMPLE } from '../src/content/levels/report';

function session(net: Network, lines: string[]): CommandResult[] {
  const history: string[] = [];
  return lines.map((l) => {
    history.push(l);
    return execute(l, { net, history });
  });
}
const text = (r: CommandResult) => r.out.join('\n');
const net = auditNet(AUDIT);

describe('npm audit', () => {
  it('reports like npm: package, range, severity, advisory link, and a summary line', () => {
    const t = text(execute('npm audit', { net, history: ['npm audit'] }));
    expect(t).toMatch(/^# npm audit report/);
    expect(t).toMatch(/minimist  <0\.2\.4 \|\| >=1\.0\.0 <1\.2\.6\nSeverity: critical\nPrototype Pollution in minimist - https:\/\/github\.com\/advisories\/GHSA-xvch-5gv4-984h/);
    expect(t).toMatch(/4 vulnerabilities \(3 high, 1 critical\)/);
  });
  it('npm audit fix stays applied, leaves the breaking one, and production is clean without dev tools', () => {
    const r = session(net, ['npm audit fix', 'npm audit', 'npm audit --omit=dev']);
    expect(text(r[0]!)).toMatch(/fixed 3 of 4 vulnerabilities/);
    expect(text(r[1]!)).toMatch(/braces[\s\S]*Will install nodemon@3\.1\.4, which is a breaking change/);
    expect(text(r[1]!)).not.toMatch(/minimist/);
    expect(r[2]!.out).toEqual(['found 0 vulnerabilities']);
    expect(execute('npm audit fix --force', { net, history: ['npm audit fix --force'] }).fail).toBeTruthy();
  });
  it('npm ls shows who pulls a package in', () => {
    expect(text(execute('npm ls minimist', { net, history: [] }))).toMatch(/└─┬ mkdirp@0\.5\.1\n  └── minimist@0\.0\.8/);
  });
});

describe('Trivy and docker', () => {
  it('warns about an unsupported OS and filters by severity', () => {
    const t = text(execute('trivy image --severity CRITICAL,HIGH lantern/api:1.4', { net, history: [] }));
    expect(t).toMatch(/This OS version is no longer supported by the distribution/);
    expect(t).toMatch(/CVE-2022-37434\s+CRITICAL/);
    expect(t).not.toMatch(/CVE-2005-2541/);
  });
  it('finds DS002 in the Dockerfile and a privileged container', () => {
    expect(text(execute('trivy config .', { net, history: [] }))).toMatch(/DS002 \(HIGH\): Specify at least 1 USER command/);
    const d = execute('docker inspect lantern-api', { net, history: [] });
    expect(d.facts).toEqual(expect.arrayContaining(['docker-user:root', 'docker-privileged']));
  });
});

describe('CloudTrail and Prowler', () => {
  it('lookup-events filters by attribute and shows the new key at work', () => {
    const r = execute('aws cloudtrail lookup-events --lookup-attributes AttributeName=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE', { net, history: [] });
    expect(text(r)).toMatch(/"EventName": "PutBucketPolicy"/);
    expect(text(r)).not.toMatch(/CreateAccessKey/);
    expect(text(execute('aws cloudtrail lookup-events --lookup-attributes AttributeName=Colour,AttributeValue=red', { net, history: [] }))).toMatch(/not a lookup attribute/);
  });
  it('prowler lists FAIL before PASS, critical first, and counts', () => {
    const t = text(execute('prowler aws --severity critical high', { net, history: [] }));
    expect(t.indexOf('s3_bucket_level_public_access_block')).toBeLessThan(t.indexOf('ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_22'));
    expect(t).toMatch(/\(4\) Failed/);
  });
});

describe('sshd -T and grep', () => {
  it('needs root, and grep -Ei picks several settings', () => {
    const cis = cisNet(AUDIT);
    expect(execute('sshd -T', { net: cis, history: [] }).fail).toMatch(/sudo/);
    const r = execute('sudo sshd -T | grep -Ei "maxauthtries|x11forwarding"', { net: cis, history: [] });
    expect(r.out).toEqual(['maxauthtries 6', 'x11forwarding yes']);
    expect(r.facts).toContain('sshd:maxauthtries:6');
    expect(r.facts).not.toContain('sshd:permitrootlogin:yes');
    expect(execute('sudo sshd -T | grep -c yes', { net: cis, history: [] }).out).toEqual(['6']);
  });
});

describe('the guided levels', () => {
  for (const l of AUDIT_LEVELS) {
    it(`${l.id}: Show me clears every step`, () => {
      const history: string[] = [];
      const facts: string[] = [];
      const submitted: string[] = [];
      for (const st of l.showMe) {
        history.push(st.act!.type);
        const r = execute(st.act!.type, { net: l.network, history });
        expect(r.fail, st.act!.type).toBeUndefined();
        facts.push(...r.facts);
        if (r.submit) submitted.push(r.submit);
      }
      expect(Object.values(evaluateTerminal(l, facts, submitted)).every(Boolean), JSON.stringify(evaluateTerminal(l, facts, submitted))).toBe(true);
    });
  }
});

describe('the executive summary', () => {
  it('the example passes every check, and jargon, length and the top three are each caught', () => {
    const good = { overall: 'Critical' as const, top: ['export', 'bucket', 'sqli'], text: SUMMARY_EXAMPLE, retest: '2026-11-19' };
    expect(summaryChecks(good, SUMMARY_SPEC).every((c) => c.pass)).toBe(true);
    const jargon = summaryChecks({ ...good, text: SUMMARY_EXAMPLE + ' The S3 bucket and an IDOR were the cause.' }, SUMMARY_SPEC).find((c) => c.id === 'plain')!;
    expect(jargon.pass).toBe(false);
    expect(jargon.detail).toMatch(/S3, bucket/);
    expect(jargonIn('the IDOR-like bug', ['IDOR'])).toEqual([]);
    expect(summaryChecks({ ...good, top: ['export', 'bucket', 'mfa'] }, SUMMARY_SPEC).find((c) => c.id === 'top')!.pass).toBe(false);
    expect(summaryChecks({ ...good, overall: 'High' }, SUMMARY_SPEC).find((c) => c.id === 'overall')!.pass).toBe(false);
    expect(summaryChecks({ ...good, retest: '2026-11-10' }, SUMMARY_SPEC).find((c) => c.id === 'retest')!.pass).toBe(false);
    expect(summaryChecks(EMPTY_SUMMARY, SUMMARY_SPEC).some((c) => c.pass)).toBe(false);
  });
});
