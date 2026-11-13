import { describe, expect, it } from 'vitest';
import { execute, complete, promptNow, type CommandResult } from '../src/sim/terminal';
import { MODULES } from '../src/sim/msf';
import { NSE } from '../src/sim/nse';
import { dockNetwork, DOCK, VALIDATION_LEVELS } from '../src/content/levels/validation';
import { evaluateTerminal } from '../src/game/evaluate';

const net = dockNetwork(DOCK);

function session(lines: string[]): CommandResult[] {
  const history: string[] = [];
  return lines.map((l) => {
    history.push(l);
    return execute(l, { net, history });
  });
}
const text = (r: CommandResult) => r.out.join('\n');

describe('msfconsole', () => {
  it('search shows rank and whether each module can check, like the real table', () => {
    const [, r] = session(['msfconsole', 'search proftpd']);
    const t = text(r!);
    expect(t).toMatch(/Matching Modules/);
    expect(t).toMatch(/exploit\/unix\/ftp\/proftpd_133c_backdoor\s+2010-12-02\s+excellent\s+No/);
    expect(t).toMatch(/exploit\/unix\/ftp\/proftpd_modcopy_exec\s+2015-04-22\s+excellent\s+Yes/);
  });
  it('use by number, the prompt names the module, options and set work, and back leaves it', () => {
    const r = session(['msfconsole', 'search ftp_version', 'use 0', 'show options', 'set RHOSTS 10.0.9.0/24', 'show options']);
    expect(text(r[3]!)).toMatch(/RHOSTS\s+yes/);
    expect(text(r[5]!)).toMatch(/RHOSTS\s+10\.0\.9\.0\/24\s+yes/);
    expect(promptNow({ net, history: ['msfconsole', 'use auxiliary/scanner/ftp/ftp_version'] })).toBe('msf6 auxiliary(scanner/ftp/ftp_version) >');
    expect(promptNow({ net, history: ['msfconsole', 'use auxiliary/scanner/ftp/ftp_version', 'back'] })).toBe('msf6 >');
    expect(complete('use auxiliary/scanner/ftp/ftp_v', { net, history: ['msfconsole'] }).line).toBe('use auxiliary/scanner/ftp/ftp_version ');
  });
  it('an auxiliary scanner reads every banner in the range and changes nothing', () => {
    const r = session(['msfconsole', 'use auxiliary/scanner/ftp/ftp_version', 'set RHOSTS 10.0.9.0/24', 'run']);
    const t = text(r[3]!);
    expect(t).toMatch(/10\.0\.9\.9:21\s+- FTP Banner: '220 ProFTPD 1\.3\.5 Server/);
    expect(t).toMatch(/10\.0\.9\.11:21\s+- FTP Banner: '220 ProFTPD 1\.3\.5a/);
    expect(t).toMatch(/Auxiliary module execution completed/);
    expect(r[3]!.fail).toBeUndefined();
  });
  it('check says appears, not exploitable, or that the module has no check', () => {
    const r = session(['msfconsole', 'use exploit/unix/ftp/proftpd_modcopy_exec', 'set RHOSTS 10.0.9.9', 'check', 'set RHOSTS 10.0.9.11', 'check', 'use exploit/unix/ftp/vsftpd_234_backdoor', 'set RHOSTS 10.0.9.21', 'check']);
    expect(text(r[3]!)).toMatch(/The target appears to be vulnerable\. Unauthenticated SITE CPFR command was successful/);
    expect(text(r[5]!)).toMatch(/The target is not exploitable/);
    expect(text(r[8]!)).toMatch(/This module does not support check/);
  });
  it('never fires an exploit: run on an exploit module is refused with the reason', () => {
    const r = session(['msfconsole', 'use exploit/unix/ftp/proftpd_modcopy_exec', 'set RHOSTS 10.0.9.9', 'run', 'exploit']);
    for (const x of [r[3]!, r[4]!]) {
      expect(text(x)).toMatch(/Not run\. The signed rules of engagement/);
      expect(x.facts).toContain('msf-refused-run');
    }
    expect(MODULES.every((m) => !m.path.startsWith('exploit/') || !m.scanner)).toBe(true);
  });
  it('the MS17-010 detector and the EternalBlue check agree on one machine', () => {
    const r = session(['msfconsole', 'use auxiliary/scanner/smb/smb_ms17_010', 'set RHOSTS 10.0.9.0/24', 'run', 'use exploit/windows/smb/ms17_010_eternalblue', 'set RHOSTS 10.0.9.40', 'check']);
    expect(text(r[3]!)).toMatch(/10\.0\.9\.40:445\s+- Host is likely VULNERABLE to MS17-010!/);
    expect(text(r[3]!)).toMatch(/10\.0\.9\.42:445\s+- Host does NOT appear vulnerable/);
    expect(text(r[6]!)).toMatch(/The target is vulnerable/);
  });
  it('unknown commands go to the shell, and exit leaves the console', () => {
    const r = session(['msfconsole', 'cat scope.txt', 'exit', 'whoami']);
    expect(text(r[1]!)).toMatch(/^\[\*\] exec: cat scope\.txt/);
    expect(r[3]!.out).toEqual(['analyst']);
  });
  it('is not there on engagements without a verification scope', () => {
    const plain = { ...net, roe: undefined };
    expect(text(execute('msfconsole', { net: plain, history: ['msfconsole'] }))).toMatch(/command not found/);
  });
});

describe('NSE', () => {
  it('script help shows the categories', () => {
    expect(text(execute('nmap --script-help ftp-vsftpd-backdoor', { net, history: [] }))).toMatch(/Categories: exploit intrusive malware vuln/);
  });
  it('safe scripts print under the port and the host, the way nmap does', () => {
    const anon = text(execute('nmap -p 21 --script ftp-anon 10.0.9.9', { net, history: [] }));
    expect(anon).toMatch(/21\/tcp open ftp\n\| ftp-anon: Anonymous FTP login allowed \(FTP code 230\)/);
    const smb = execute('nmap -p 445 --script smb-vuln-ms17-010 10.0.9.40', { net, history: [] });
    expect(text(smb)).toMatch(/Host script results:\n\| smb-vuln-ms17-010: \n\|  VULNERABLE:/);
    expect(smb.facts).toContain('nse-vuln:10.0.9.40:CVE-2017-0143');
  });
  it('intrusive and exploit scripts are refused on a verification-only job, and "vuln and safe" is fine', () => {
    expect(execute('nmap -p 21 --script ftp-vsftpd-backdoor 10.0.9.21', { net, history: [] }).fail).toMatch(/checks only/);
    expect(execute('nmap --script vuln 10.0.9.0/24', { net, history: [] }).fail).toMatch(/vuln and safe/);
    expect(execute('nmap --script "vuln and safe" 10.0.9.0/24', { net, history: [] }).fail).toBeUndefined();
  });
  it('every script has real categories', () => {
    for (const s of NSE) expect(s.categories.every((c) => ['default', 'safe', 'intrusive', 'exploit', 'vuln', 'discovery', 'auth', 'malware', 'external', 'dos'].includes(c)), s.name).toBe(true);
  });
});

describe('the guided levels', () => {
  for (const l of VALIDATION_LEVELS) {
    it(`${l.id}: Show me clears every step`, () => {
      const history: string[] = [];
      const facts: string[] = [];
      const submitted: string[] = [];
      for (const st of l.showMe) {
        const line = st.act!.type;
        history.push(line);
        const r = execute(line, { net: l.network, history });
        facts.push(...r.facts);
        if (r.submit) submitted.push(r.submit);
      }
      expect(Object.values(evaluateTerminal(l, facts, submitted)).every(Boolean), JSON.stringify(evaluateTerminal(l, facts, submitted))).toBe(true);
    });
  }
});
