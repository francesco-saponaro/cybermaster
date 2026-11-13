// A few of nmap's NSE scripts, with their real names and categories. A script
// in the "intrusive" or "exploit" category is refused on an engagement that
// only allows non-destructive checks, the way a careful tester would.

import type { Host, Port } from './terminal';
import { lookupCves } from './terminal';

export interface NseScript {
  name: string;
  categories: string[];
  description: string;
  /** Runs against one open port; null when it has nothing to say. */
  port?: (h: Host, p: Port) => string[] | null;
  /** Runs once per host, under "Host script results". */
  host?: (h: Host) => string[] | null;
}

const has = (p: Port, f: string) => !!p.flags?.includes(f);

export const NSE: NseScript[] = [
  {
    name: 'ftp-anon',
    categories: ['default', 'auth', 'safe'],
    description: 'Checks if an FTP server allows anonymous logins. If anonymous is allowed, gets a directory listing of the root directory and highlights writeable files.',
    port: (_h, p) => (p.port === 21 && has(p, 'anon-ftp') ? ['Anonymous FTP login allowed (FTP code 230)', '-rw-r--r--   1 ftp      ftp      18874368 Nov 08 23:10 harbor-share.tar.gz', 'drwxrwxrwx   2 ftp      ftp          4096 Nov 02 09:12 incoming [NSE: writeable]'] : null),
  },
  {
    name: 'ftp-syst',
    categories: ['default', 'discovery', 'safe'],
    description: 'Sends FTP SYST and STAT commands and returns the result.',
    port: (_h, p) => (p.port === 21 && has(p, 'anon-ftp') ? ['STAT:', 'FTP server status:', '     Logged in as ftp', '     TYPE: ASCII'] : null),
  },
  {
    name: 'ssh-hostkey',
    categories: ['default', 'discovery', 'safe'],
    description: "Shows SSH hostkeys: the server's public key fingerprints.",
    port: (_h, p) => (p.port === 22 ? ['256 9c:1e:0b:7a:52:41:3d:88:aa:10:5f:e2:71:c4:0d:9b (ECDSA)', '256 41:7e:22:c9:a8:0f:6b:13:91:de:ac:4e:52:77:b0:3a (ED25519)'] : null),
  },
  {
    name: 'http-title',
    categories: ['default', 'discovery', 'safe'],
    description: 'Shows the title of the default page of a web server.',
    port: (_h, p) => {
      const m = /<title>([^<]*)<\/title>/i.exec(p.http?.body ?? '');
      return m ? [m[1]!] : null;
    },
  },
  {
    name: 'smb-os-discovery',
    categories: ['default', 'discovery', 'safe'],
    description: 'Attempts to determine the operating system, computer name, domain and workgroup over the SMB protocol.',
    host: (h) => {
      const p = h.ports.find((x) => x.port === 445);
      if (!p) return null;
      return /windows/i.test(p.product ?? '') ? ['  OS: Windows 7 Professional 7601 Service Pack 1 (Windows 7 Professional 6.1)', `  Computer name: ${(h.name ?? 'host').split('.')[0]!.toUpperCase()}`, '  Workgroup: DOCK\\x00'] : [`  OS: Unix (${p.product} ${p.version ?? ''})`.trimEnd(), `  Computer name: ${(h.name ?? 'host').split('.')[0]}`];
    },
  },
  {
    name: 'smb-vuln-ms17-010',
    categories: ['vuln', 'safe'],
    description: 'Attempts to detect if a Microsoft SMBv1 server is vulnerable to a remote code execution vulnerability (ms17-010, a.k.a. EternalBlue). The check is done without exploiting it: it asks one question and reads the error code.',
    host: (h) => {
      const p = h.ports.find((x) => x.port === 445);
      if (!p || !has(p, 'ms17-010')) return null;
      return ['  VULNERABLE:', '  Remote Code Execution vulnerability in Microsoft SMBv1 servers (ms17-010)', '    State: VULNERABLE', '    IDs:  CVE:CVE-2017-0143', '    Risk factor: HIGH', '      A critical remote code execution vulnerability exists in Microsoft SMBv1', '       servers (ms17-010).', '', '    Disclosure date: 2017-03-14', '    References:', '      https://technet.microsoft.com/en-us/library/security/ms17-010.aspx', '      https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-0143'];
    },
  },
  {
    name: 'vulners',
    categories: ['vuln', 'safe', 'external'],
    description: 'For each service version nmap detected (-sV), lists known CVEs and their CVSS scores from the vulners.com database. It reads versions; it proves nothing.',
    port: (_h, p) => {
      if (!p.product || !p.version) return null;
      const hits = lookupCves(p.product, p.version);
      if (!hits.length) return null;
      return [`  cpe:/a:${p.product.toLowerCase().replace(/\s+/g, '_')}:${p.version}:`, ...hits.map((c) => `    \t${c.id}\t${c.score.toFixed(1)}\thttps://vulners.com/cve/${c.id}`)];
    },
  },
  {
    name: 'ftp-vsftpd-backdoor',
    categories: ['exploit', 'intrusive', 'malware', 'vuln'],
    description: 'Tests for the presence of the vsFTPd 2.3.4 backdoor reported on 2011-07-04 (CVE-2011-2523). This script attempts to exploit the backdoor using the innocuous id command by default.',
  },
  {
    name: 'ftp-proftpd-backdoor',
    categories: ['exploit', 'intrusive', 'malware', 'vuln'],
    description: 'Tests for the presence of the ProFTPD 1.3.3c backdoor reported as BID 45150. This script attempts to exploit the backdoor using the innocuous id command by default.',
  },
  {
    name: 'smb-vuln-ms10-061',
    categories: ['vuln', 'intrusive'],
    description: 'Tests whether target machines are vulnerable to the ms10-061 Printer Spooler impersonation vulnerability. This check is dangerous and it may crash systems.',
  },
];

export const NSE_BY_NAME = Object.fromEntries(NSE.map((s) => [s.name, s])) as Record<string, NseScript>;

/** Expand --script arguments: names, categories ("default", "vuln", "safe") and "and"/"or"/"not" are kept simple: a comma list of names or categories. */
export function expandScripts(spec: string): { scripts: NseScript[]; unknown: string[] } {
  const out = new Set<NseScript>();
  const unknown: string[] = [];
  for (const raw of spec.split(',').map((x) => x.trim()).filter(Boolean)) {
    const byName = NSE_BY_NAME[raw];
    if (byName) out.add(byName);
    else {
      const cat = NSE.filter((s) => s.categories.includes(raw));
      if (cat.length) cat.forEach((s) => out.add(s));
      else unknown.push(raw);
    }
  }
  return { scripts: [...out], unknown };
}

export function scriptHelp(name: string): string[] | null {
  const s = NSE_BY_NAME[name] ?? null;
  if (!s) return null;
  return ['', s.name, `Categories: ${s.categories.join(' ')}`, `https://nmap.org/nsedoc/scripts/${s.name}.html`, `  ${s.description}`, ''];
}

/** Scripts that change or may break the target: refused when the engagement allows checks only. */
export const isIntrusive = (s: NseScript) => s.categories.includes('intrusive') || s.categories.includes('exploit') || s.categories.includes('dos');
