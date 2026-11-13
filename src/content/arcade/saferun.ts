// The pairs in Safe to Run, The Validation's bonus round. Dock signed for
// verification only. Two things you could type next: which one does the
// engagement allow? Tier 3 pairs look alike and one detail decides.

import type { CardLine } from './forgery';

export interface SafePair {
  id: string;
  tier: 1 | 2 | 3;
  topic: string;
  /** The allowed one. */
  first: CardLine[];
  /** The one that breaks the rules. */
  later: CardLine[];
  why: string;
  rule: string;
}

const cmd = (line: string, what: string): CardLine[] => [
  { label: 'Command', value: line },
  { label: 'What it does', value: what },
];

export const SAFE_PAIRS: SafePair[] = [
  // ---- Tier 1 ---------------------------------------------------------------------------
  {
    id: 'check-vs-run',
    tier: 1,
    topic: 'Confirming the FTP finding',
    first: cmd('check', 'asks one harmless question'),
    later: cmd('run', 'fires the exploit at the server'),
    why: 'check proves the flaw without using it. run uses it, and can change or crash the server.',
    rule: 'Verification only: check, never run, on an exploit.',
  },
  {
    id: 'aux-vs-exploit',
    tier: 1,
    topic: 'Learning the FTP versions',
    first: cmd('use auxiliary/scanner/ftp/ftp_version', 'reads each banner'),
    later: cmd('use exploit/unix/ftp/vsftpd_234_backdoor', 'opens the backdoor'),
    why: 'Auxiliary scanners only gather information. An exploit module is for using a flaw.',
    rule: 'auxiliary/ gathers, exploit/ attacks.',
  },
  {
    id: 'nse-safe',
    tier: 1,
    topic: 'Testing anonymous FTP',
    first: cmd('nmap --script ftp-anon', 'categories: default auth safe'),
    later: cmd('nmap --script ftp-vsftpd-backdoor', 'categories: exploit intrusive malware vuln'),
    why: 'ftp-anon only tries an anonymous login. The backdoor script triggers the backdoor itself.',
    rule: 'Read the categories: exploit means it uses the flaw.',
  },
  {
    id: 'help-first',
    tier: 1,
    topic: 'A script you have never used',
    first: cmd('nmap --script-help smb-vuln-ms10-061', 'prints what it does'),
    later: cmd('nmap --script smb-vuln-ms10-061', '"This check is dangerous and it may crash systems."'),
    why: 'Running a script you have not read is how outages happen. --script-help costs nothing.',
    rule: 'Read a script before you run it.',
  },
  {
    id: 'scope-range',
    tier: 1,
    topic: 'Where to point the scanner',
    first: cmd('set RHOSTS 10.0.9.0/24', 'the signed range'),
    later: cmd('set RHOSTS 10.0.0.0/16', '65,536 addresses, most unsigned'),
    why: 'Only the /24 is in the scope. The /16 includes networks nobody gave permission for.',
    rule: 'RHOSTS never goes wider than the scope.',
  },
  // ---- Tier 2 -----------------------------------------------------------------------------
  {
    id: 'vuln-and-safe',
    tier: 2,
    topic: 'Running every vulnerability check',
    first: cmd('nmap --script "vuln and safe"', 'vuln checks that are also safe'),
    later: cmd('nmap --script vuln', 'every vuln script, intrusive ones included'),
    why: 'The vuln category mixes safe checks with intrusive ones that may crash a service. "vuln and safe" keeps only the harmless ones.',
    rule: 'Categories can be combined: "vuln and safe".',
  },
  {
    id: 'detector-vs-eternal',
    tier: 2,
    topic: 'Is the Windows 7 machine vulnerable?',
    first: cmd('use auxiliary/scanner/smb/smb_ms17_010; run', 'reads one error code'),
    later: cmd('use exploit/windows/smb/ms17_010_eternalblue; run', 'kernel exploit, may blue-screen'),
    why: 'The detector answers the question. EternalBlue can crash the machine even when it "works".',
    rule: 'Detect with a detector; never fire EternalBlue on a client.',
  },
  {
    id: 'login-scanner',
    tier: 2,
    topic: 'Testing the SSH servers',
    first: cmd('use auxiliary/scanner/ssh/ssh_version; run', 'reads the version'),
    later: cmd('use auxiliary/scanner/ssh/ssh_login; run', 'tries passwords on every server'),
    why: 'A login scanner is auxiliary but still tries passwords: it locks accounts and fills logs. It needs explicit permission.',
    rule: 'Password guessing needs its own permission, auxiliary or not.',
  },
  {
    id: 'rank',
    tier: 2,
    topic: 'Two modules for the same check',
    first: cmd('Rank: excellent, Check: Yes', 'never crashes the service'),
    later: cmd('Rank: average, Check: No', 'may crash; cannot verify safely'),
    why: 'A module with check and an excellent rank can verify without risk. The other can only be fired.',
    rule: 'Prefer Check: Yes and a high rank.',
  },
  {
    id: 'vulners',
    tier: 2,
    topic: 'Listing CVEs for the versions found',
    first: cmd('nmap -sV --script vulners', 'safe: matches versions to CVEs'),
    later: cmd('nmap -sV --script exploit', 'runs every exploit-category script'),
    why: 'vulners only reads versions and looks them up. The exploit category tries to use the flaws.',
    rule: 'Version matching is safe; it is also not proof.',
  },
  // ---- Tier 3 -------------------------------------------------------------------------------
  {
    id: 'check-out-of-scope',
    tier: 3,
    topic: 'A check on the shared hosting',
    first: cmd('set RHOSTS 10.0.9.9; check', 'Dock\'s FTP server, in scope'),
    later: cmd('set RHOSTS 198.51.100.7; check', 'a hosting company\'s server'),
    why: 'Both are only a check, but the second machine is not the client\'s. Harmless or not, it needs permission.',
    rule: 'Scope comes before safety: no permission, no packets.',
  },
  {
    id: 'no-check',
    tier: 3,
    topic: 'The vsftpd module has no check',
    first: cmd('report it as "unverified, based on version"', 'honest, nothing touched'),
    later: cmd('run it once to be sure', 'opens the backdoor on a client'),
    why: 'When no safe check exists, you say so, or agree a controlled test in writing. Proving it by firing is not verification.',
    rule: 'No check means unverified, not "fire to find out".',
  },
  {
    id: 'payload-set',
    tier: 3,
    topic: 'Learning the payload options',
    first: cmd('set PAYLOAD cmd/unix/reverse_netcat; show options', 'configures, sends nothing'),
    later: cmd('set PAYLOAD cmd/unix/reverse_netcat; exploit', 'sends it'),
    why: 'Setting options sends nothing anywhere. exploit is run under another name.',
    rule: 'exploit and run are the same command.',
  },
  {
    id: 'threads',
    tier: 3,
    topic: 'Scanning a fragile old network',
    first: cmd('set THREADS 4; run', 'a few hosts at a time'),
    later: cmd('set THREADS 256; run', 'every host at once'),
    why: 'Both are safe scanners, but 256 threads floods old printers and controllers. Gentle is part of non-destructive.',
    rule: 'Non-destructive includes not flooding the network.',
  },
  {
    id: 'anon-download',
    tier: 3,
    topic: 'Anonymous FTP is open',
    first: cmd('nmap --script ftp-anon', 'lists the files, opens none'),
    later: cmd('get harbor-share.tar.gz', 'downloads the client\'s data'),
    why: 'The listing proves the exposure. Downloading the data takes a copy of client information you do not need.',
    rule: 'Prove access; do not take the data.',
  },
];

export const SAFE_BY_ID = Object.fromEntries(SAFE_PAIRS.map((p) => [p.id, p])) as Record<string, SafePair>;
