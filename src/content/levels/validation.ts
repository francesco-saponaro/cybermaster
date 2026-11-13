import type { TerminalLevel } from '../types';
import type { Host, Network, Port } from '../../sim/terminal';

// The dock network again, on Tuesday afternoon. Dock Logistics signed a scope
// for verification only: scan, ask, check, but fire nothing. Addresses are
// private; names end in .lan.

export interface DockPlan {
  lan: string;
  /** ProFTPD 1.3.5 with mod_copy: the one that appears vulnerable. */
  ftp: number;
  /** ProFTPD 1.3.5a, patched. */
  ftpFixed: number;
  /** vsftpd 2.3.4: no check exists. */
  vsftpd: number;
  /** An old Windows 7 machine with SMBv1, vulnerable to MS17-010. */
  win: number;
  /** A patched Windows Server with SMB. */
  winOk: number;
  nas: number;
  me: number;
}

export const DOCK: DockPlan = { lan: '10.0.9', ftp: 9, ftpFixed: 11, vsftpd: 21, win: 40, winOk: 42, nas: 30, me: 250 };

const ssh: Port = { port: 22, service: 'ssh', product: 'OpenSSH', version: '9.6p1', extra: 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', banner: 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' };

export function dockNetwork(p: DockPlan): Network {
  const at = (n: number) => `${p.lan}.${n}`;
  const hosts: Host[] = [
    { ip: at(5), name: 'proxy.dock.lan', ports: [ssh, { port: 443, service: 'https', product: 'nginx', version: '1.24.0', http: { status: 200, headers: [['Server', 'nginx']], body: '<!doctype html><title>Dock proxy</title>' } }] },
    { ip: at(p.ftp), name: 'ftp.dock.lan', ports: [{ port: 21, service: 'ftp', product: 'ProFTPD', version: '1.3.5', banner: `220 ProFTPD 1.3.5 Server (Dock files) [${at(p.ftp)}]`, flags: ['anon-ftp'] }, ssh, { port: 80, service: 'http', product: 'Apache httpd', version: '2.4.58', extra: '((Ubuntu))', http: { status: 200, headers: [['Server', 'Apache/2.4.58 (Ubuntu)']], body: '<!doctype html><title>Dock files</title>' } }] },
    { ip: at(p.ftpFixed), name: 'backup-ftp.dock.lan', ports: [{ port: 21, service: 'ftp', product: 'ProFTPD', version: '1.3.5a', banner: `220 ProFTPD 1.3.5a Server (Backups) [${at(p.ftpFixed)}]` }, ssh] },
    { ip: at(p.vsftpd), name: 'old-ftp.dock.lan', ports: [{ port: 21, service: 'ftp', product: 'vsftpd', version: '2.3.4', banner: '220 (vsFTPd 2.3.4)' }] },
    { ip: at(p.nas), name: 'nas.dock.lan', ports: [{ port: 445, service: 'microsoft-ds', product: 'Samba smbd', version: '4.19.5-Ubuntu' }] },
    { ip: at(p.win), name: 'scanstation.dock.lan', ports: [{ port: 135, service: 'msrpc', product: 'Microsoft Windows RPC' }, { port: 139, service: 'netbios-ssn', product: 'Microsoft Windows netbios-ssn' }, { port: 445, service: 'microsoft-ds', product: 'Microsoft Windows 7 - 10 microsoft-ds', extra: '(workgroup: DOCK)', flags: ['smbv1', 'ms17-010'] }] },
    { ip: at(p.winOk), name: 'files-win.dock.lan', ports: [{ port: 135, service: 'msrpc', product: 'Microsoft Windows RPC' }, { port: 445, service: 'microsoft-ds', product: 'Microsoft Windows Server 2022 microsoft-ds' }, { port: 3389, service: 'ms-wbt-server', product: 'Microsoft Terminal Services' }] },
  ];
  return {
    cidr: `${p.lan}.0/24`,
    hosts,
    dns: {},
    whois: {},
    files: {
      'scope.txt': `Engagement: Dock Logistics, internal network ${p.lan}.0/24.\nType: verification of known findings. Non-destructive only.\nAllowed: discovery, version detection, safe NSE scripts, Metasploit auxiliary scanners and check.\nNot allowed: running exploits, intrusive scripts, anything that changes or may crash a system.\nTester laptop: ${at(p.me)}.`,
      'notes.txt': `Monday's finding: ProFTPD 1.3.5 on ftp.dock.lan, CVE-2015-3306, from its banner.\nClaire asks: can it really be abused, before she pays for a new server?`,
    },
    roe: 'check-only',
  };
}

const P = DOCK;
const at = (n: number) => `${P.lan}.${n}`;
const NET = dockNetwork(P);

export const VALIDATION_LEVELS: TerminalLevel[] = [
  {
    id: 'msf-modules',
    zone: 'validation',
    kind: 'terminal',
    manual: 'msfconsole',
    title: 'The right module',
    goal: 'Find the Metasploit module for ProFTPD 1.3.5 that can check without exploiting, and submit its name.',
    instruction: '[[msf-console|Metasploit]] is a library of modules, each written for one known flaw, driven from a console called msfconsole. The first job is finding the right module and reading what it does.',
    network: NET,
    checks: [
      { id: 'scope', label: 'Read what you may do', do: 'Click the prompt at the bottom of the Terminal panel, type `cat scope.txt` and press Enter.', learned: 'Verification only: scanners and check yes, exploits no.' },
      { id: 'start', label: 'Open the console', do: 'Type `msfconsole` and press Enter. The prompt changes to `msf6 >`.', learned: 'msfconsole is where you search, configure and run Metasploit modules.' },
      { id: 'search', label: 'Search for ProFTPD', do: 'Type `search proftpd` and press Enter. Read the Rank and Check columns of each result.', learned: 'Check says whether the module can ask the target "are you vulnerable?" without attacking it.' },
      { id: 'info', label: 'Read the module', do: 'Type `info exploit/unix/ftp/proftpd_modcopy_exec` and press Enter. Read Check supported, the Description and the CVE in References.', learned: 'info tells you what a module touches before you touch anything.' },
      { id: 'answer', label: 'Submit the module', do: 'Type `submit` followed by the module name that says Check: Yes, as printed: exploit/unix/ftp/proftpd_modcopy_exec.', learned: 'Its reference is CVE-2015-3306, the finding from Monday.' },
    ],
    goals: [
      { id: 'scope', facts: ['cat:scope.txt'] },
      { id: 'start', facts: ['msf-start'] },
      { id: 'search', facts: ['msf-search:proftpd'] },
      { id: 'info', facts: ['msf-info:exploit/unix/ftp/proftpd_modcopy_exec'] },
      { id: 'answer', answers: ['exploit/unix/ftp/proftpd_modcopy_exec', 'proftpd_modcopy_exec'] },
    ],
    wrong: [{ answers: ['exploit/unix/ftp/proftpd_133c_backdoor', 'proftpd_133c_backdoor'], reason: 'That one is for the 1.3.3c backdoor, a different version, and it has no check. Submit the mod_copy module.' }],
    otherwise: 'Submit the full module name from the search, the one for ProFTPD 1.3.5 with Check: Yes.',
    showMe: [
      { say: 'What you may do.', act: { type: 'cat scope.txt', run: true } },
      { say: 'Open the console.', act: { type: 'msfconsole', run: true } },
      { say: 'Find the modules.', act: { type: 'search proftpd', run: true } },
      { say: 'Read the one for 1.3.5.', act: { type: 'info exploit/unix/ftp/proftpd_modcopy_exec', run: true } },
      { say: 'Check: Yes, CVE-2015-3306.', act: { type: 'submit exploit/unix/ftp/proftpd_modcopy_exec' } },
    ],
    realName: 'Metasploit: finding and reading modules',
    didWhat: 'You found the module for a known CVE and read what it does before running anything.',
    codex: ['msf-console'],
    xp: 90,
    par: 120,
  },
  {
    id: 'msf-auxiliary',
    zone: 'validation',
    kind: 'terminal',
    manual: 'msfconsole',
    title: 'Scanners first',
    goal: 'Use an auxiliary scanner to list every FTP server on the dock network, and submit the one that runs ProFTPD 1.3.5 exactly.',
    instruction: '[[msf-auxiliary|Auxiliary modules]] gather information and never exploit anything: scanners, version detectors, login checkers. You set the targets with RHOSTS, which takes a whole range.',
    network: NET,
    checks: [
      { id: 'start', label: 'Open the console', do: 'At the terminal prompt, type `msfconsole` and press Enter.', learned: 'Every Metasploit session starts here.' },
      { id: 'use', label: 'Pick the FTP version scanner', do: 'Type `use auxiliary/scanner/ftp/ftp_version` and press Enter. The prompt now names the module.', learned: 'auxiliary/scanner/... modules read banners and answers; they change nothing.' },
      { id: 'options', label: 'See what it needs', do: 'Type `show options` and press Enter. RHOSTS is required and empty.', learned: 'Required options with no value are what you must set before running.' },
      { id: 'rhosts', label: 'Point it at the network', do: 'Type `set RHOSTS 10.0.9.0/24` and press Enter.', learned: 'RHOSTS takes one address, a list or a whole range.' },
      { id: 'run', label: 'Run the scanner', do: 'Type `run` and press Enter. Each FTP server answers with its banner.', learned: 'One scan, every FTP version on the network, read from the services themselves.' },
      { id: 'answer', label: 'Submit the 1.3.5 server', do: 'Two servers say ProFTPD: one 1.3.5, one 1.3.5a. Type `submit` followed by the address of the one that says exactly 1.3.5.', learned: '1.3.5a is the release that fixed mod_copy: one letter is a whole patch.' },
    ],
    goals: [
      { id: 'start', facts: ['msf-start'] },
      { id: 'use', facts: ['msf-use:auxiliary/scanner/ftp/ftp_version'] },
      { id: 'options', facts: ['msf-options:auxiliary/scanner/ftp/ftp_version'] },
      { id: 'rhosts', facts: [`msf-opt:RHOSTS=${P.lan}.0/24`] },
      { id: 'run', facts: [`msf-run:auxiliary/scanner/ftp/ftp_version:${P.lan}.0/24`] },
      { id: 'answer', answers: [at(P.ftp), 'ftp.dock.lan'] },
    ],
    wrong: [
      { answers: [at(P.ftpFixed)], reason: 'That one says 1.3.5a: the a is the release that fixed mod_copy.' },
      { answers: [at(P.vsftpd)], reason: 'That is vsftpd, not ProFTPD.' },
    ],
    otherwise: 'Submit the address whose banner says ProFTPD 1.3.5 with no letter after it.',
    showMe: [
      { say: 'Open the console.', act: { type: 'msfconsole', run: true } },
      { say: 'The FTP scanner.', act: { type: 'use auxiliary/scanner/ftp/ftp_version', run: true } },
      { say: 'What it needs.', act: { type: 'show options', run: true } },
      { say: 'The whole range.', act: { type: `set RHOSTS ${P.lan}.0/24`, run: true } },
      { say: 'Every banner.', act: { type: 'run', run: true } },
      { say: 'Exactly 1.3.5.', act: { type: `submit ${at(P.ftp)}` } },
    ],
    realName: 'Metasploit auxiliary scanners',
    didWhat: 'You read every FTP banner on a network with one scanner and told a patched version from a vulnerable one.',
    codex: ['msf-auxiliary'],
    xp: 100,
    par: 150,
  },
  {
    id: 'msf-nse',
    zone: 'validation',
    kind: 'terminal',
    manual: 'nmap',
    title: "nmap's own scripts",
    goal: 'Use safe NSE scripts to confirm two findings: what the anonymous FTP shares, and which CVE the old Windows machine has. Submit the CVE.',
    instruction: 'nmap can run [[nse|NSE scripts]] against what it finds, each tagged with categories like safe, vuln, intrusive or exploit. On a verification-only job you read a script\'s categories before you run it.',
    network: NET,
    checks: [
      { id: 'help', label: 'Read a script before running it', do: 'At the terminal prompt, type `nmap --script-help ftp-anon` and press Enter. Its categories include safe.', learned: 'safe means the script does not change or crash the target.' },
      { id: 'anon', label: 'Check for anonymous FTP', do: 'Type `nmap -p 21 --script ftp-anon 10.0.9.9` and press Enter. The script logs in as anonymous and lists what it can see.', learned: 'Anonymous FTP with a writeable folder is a finding on its own, whatever the version.' },
      { id: 'bad', label: 'Read one you must not run', do: 'Type `nmap --script-help ftp-vsftpd-backdoor` and press Enter. Its categories include exploit and intrusive.', learned: 'An exploit-category script uses the flaw itself: out of bounds on a verification job.' },
      { id: 'smb', label: 'Ask the Windows machine about MS17-010', do: 'Type `nmap -p 445 --script smb-vuln-ms17-010 10.0.9.40` and press Enter. It is in the vuln and safe categories.', learned: 'This script asks one question and reads the error code, without exploiting anything.' },
      { id: 'answer', label: 'Submit the CVE', do: 'Read the IDs line in Host script results. Type `submit` followed by the CVE it names.', learned: 'MS17-010 is the flaw WannaCry used in 2017: an unpatched Windows 7 still has it.' },
    ],
    goals: [
      { id: 'help', facts: ['nse-help:ftp-anon'] },
      { id: 'anon', facts: [`nse:ftp-anon:${at(P.ftp)}`] },
      { id: 'bad', facts: ['nse-help:ftp-vsftpd-backdoor'] },
      { id: 'smb', facts: [`nse:smb-vuln-ms17-010:${at(P.win)}`] },
      { id: 'answer', answers: ['CVE-2017-0143', 'MS17-010'] },
    ],
    wrong: [{ answers: ['CVE-2015-3306'], reason: 'That is the FTP server\'s CVE. Submit the one the SMB script found on 10.0.9.40.' }],
    otherwise: 'Submit the CVE on the IDs line of the smb-vuln-ms17-010 result.',
    showMe: [
      { say: 'Categories first.', act: { type: 'nmap --script-help ftp-anon', run: true } },
      { say: 'Anonymous FTP.', act: { type: `nmap -p 21 --script ftp-anon ${at(P.ftp)}`, run: true } },
      { say: 'This one is an exploit: never on this job.', act: { type: 'nmap --script-help ftp-vsftpd-backdoor', run: true } },
      { say: 'A safe vuln check.', act: { type: `nmap -p 445 --script smb-vuln-ms17-010 ${at(P.win)}`, run: true } },
      { say: 'The CVE.', act: { type: 'submit CVE-2017-0143' } },
    ],
    realName: 'Nmap Scripting Engine (NSE)',
    didWhat: 'You confirmed two findings with safe scripts and recognised one you must never run here.',
    codex: ['nse'],
    xp: 100,
    par: 150,
  },
  {
    id: 'msf-exploit-payload',
    zone: 'validation',
    kind: 'terminal',
    manual: 'msfconsole',
    title: 'Exploit and payload',
    goal: 'Set up the ProFTPD module with a reverse payload that calls your laptop, and say which part decides what runs on the server.',
    instruction: 'An [[exploit-payload|exploit]] is the code that abuses the flaw; the payload is what it leaves running on the target, such as a shell that calls back to you. Setting one up teaches the parts even when the rules say you will not fire it.',
    network: NET,
    checks: [
      { id: 'use', label: 'Select the exploit', do: 'At the terminal prompt, type `msfconsole` and press Enter, then `use exploit/unix/ftp/proftpd_modcopy_exec`.', learned: 'The prompt now shows exploit(...): an exploit module is loaded.' },
      { id: 'payloads', label: 'List the payloads it can carry', do: 'Type `show payloads` and press Enter. bind payloads wait for you to connect; reverse payloads connect back to you.', learned: 'Reverse payloads get out through firewalls that block incoming connections, which is why attackers prefer them.' },
      { id: 'payload', label: 'Pick a reverse payload', do: 'Type `set PAYLOAD cmd/unix/reverse_netcat` and press Enter.', learned: 'The payload choice is separate from the exploit: one flaw, many possible outcomes.' },
      { id: 'lhost', label: 'Tell it where to call back', do: 'Type `set LHOST 10.0.9.250` (your laptop, from scope.txt) and press Enter, then `show options` to see it filled in.', learned: 'LHOST is your own address: a reverse payload connects to it.' },
      { id: 'answer', label: 'Which part decides what runs?', do: 'Type `submit payload` or `submit exploit`: which one decides what runs on the server once the flaw is open?', learned: 'The exploit opens the door; the payload is what walks through it.' },
    ],
    goals: [
      { id: 'use', facts: ['msf-use:exploit/unix/ftp/proftpd_modcopy_exec'] },
      { id: 'payloads', facts: ['msf-payloads'] },
      { id: 'payload', facts: ['msf-payload:reverse'] },
      { id: 'lhost', facts: [`msf-opt:LHOST=${at(P.me)}`] },
      { id: 'answer', answers: ['payload'] },
    ],
    wrong: [{ answers: ['exploit'], reason: 'The exploit only abuses the flaw to get code running. What that code is, a shell, a single command, is the payload.' }],
    otherwise: 'Answer with submit payload or submit exploit.',
    showMe: [
      { say: 'Open the console.', act: { type: 'msfconsole', run: true } },
      { say: 'The exploit module.', act: { type: 'use exploit/unix/ftp/proftpd_modcopy_exec', run: true } },
      { say: 'What it can carry.', act: { type: 'show payloads', run: true } },
      { say: 'A reverse shell.', act: { type: 'set PAYLOAD cmd/unix/reverse_netcat', run: true } },
      { say: 'Your laptop.', act: { type: `set LHOST ${at(P.me)}`, run: true } },
      { say: 'The payload decides.', act: { type: 'submit payload' } },
    ],
    realName: 'Exploits, payloads, bind and reverse',
    didWhat: 'You set up an exploit and a reverse payload, and kept them apart in your head.',
    codex: ['exploit-payload'],
    xp: 100,
    par: 150,
  },
  {
    id: 'msf-check',
    zone: 'validation',
    kind: 'terminal',
    manual: 'msfconsole',
    title: 'Check, do not fire',
    goal: 'Use check on both ProFTPD servers and on the vsftpd one. Submit the address you can report as confirmed.',
    instruction: '[[msf-check|check]] asks the target a harmless question that only a vulnerable version answers a certain way, so you can prove a finding without breaking anything. Not every module has one, and that matters too.',
    network: NET,
    checks: [
      { id: 'appears', label: 'Check the 1.3.5 server', do: 'Type `msfconsole`, then `use exploit/unix/ftp/proftpd_modcopy_exec`, `set RHOSTS 10.0.9.9` and `check`, pressing Enter after each.', learned: '"Appears to be vulnerable": the server accepted the copy command without a login.' },
      { id: 'safe', label: 'Check the patched one', do: 'Type `set RHOSTS 10.0.9.11` and `check`. It answers differently.', learned: '"Not exploitable": the same question, refused, so 1.3.5a really is fixed.' },
      { id: 'refused', label: 'Try to fire it', do: 'Type `run` once, to see what the rules of engagement do to an exploit here.', learned: 'Running an exploit can crash a client machine: on a verification job you never do it.' },
      { id: 'nocheck', label: 'A module with no check', do: 'Type `use exploit/unix/ftp/vsftpd_234_backdoor`, `set RHOSTS 10.0.9.21` and `check`.', learned: 'No check means Metasploit cannot verify it safely: say so in the report and verify another way.' },
      { id: 'answer', label: 'Submit the confirmed finding', do: 'Type `submit` followed by the address that appears vulnerable.', learned: 'A finding confirmed by check, with the exact message, is evidence a client can act on.' },
    ],
    goals: [
      { id: 'appears', facts: [`msf-check:${at(P.ftp)}:appears`] },
      { id: 'safe', facts: [`msf-check:${at(P.ftpFixed)}:safe`] },
      { id: 'refused', facts: ['msf-refused-run'] },
      { id: 'nocheck', facts: ['msf-nocheck:exploit/unix/ftp/vsftpd_234_backdoor'] },
      { id: 'answer', answers: [at(P.ftp), 'ftp.dock.lan'] },
    ],
    wrong: [
      { answers: [at(P.ftpFixed)], reason: 'check said it is not exploitable: 1.3.5a is patched.' },
      { answers: [at(P.vsftpd)], reason: 'The vsftpd module has no check, so Metasploit confirmed nothing there. Report it as unverified.' },
    ],
    otherwise: 'Submit the address whose check said "appears to be vulnerable".',
    showMe: [
      { say: 'Open the console.', act: { type: 'msfconsole', run: true } },
      { say: 'The module.', act: { type: 'use exploit/unix/ftp/proftpd_modcopy_exec', run: true } },
      { say: 'The 1.3.5 server.', act: { type: `set RHOSTS ${at(P.ftp)}`, run: true } },
      { say: 'Ask it.', act: { type: 'check', run: true } },
      { say: 'The patched one.', act: { type: `set RHOSTS ${at(P.ftpFixed)}`, run: true } },
      { say: 'Ask it too.', act: { type: 'check', run: true } },
      { say: 'Firing is refused.', act: { type: 'run', run: true } },
      { say: 'The vsftpd module.', act: { type: 'use exploit/unix/ftp/vsftpd_234_backdoor', run: true } },
      { say: 'Its target.', act: { type: `set RHOSTS ${at(P.vsftpd)}`, run: true } },
      { say: 'No check exists.', act: { type: 'check', run: true } },
      { say: 'The confirmed one.', act: { type: `submit ${at(P.ftp)}` } },
    ],
    realName: 'Non-destructive verification with check',
    didWhat: 'You confirmed one finding, cleared a patched server and refused to fire an exploit.',
    codex: ['msf-check'],
    evidence: ['ev-msf-check'],
    xp: 120,
    par: 200,
  },
  {
    id: 'msf-boss',
    zone: 'validation',
    kind: 'terminal',
    boss: true,
    manual: 'msfconsole',
    title: 'Before the worm does',
    goal: 'Something on the dock network is probing port 445. Find which Windows machine is vulnerable to MS17-010, confirm it with check, and submit its address.',
    instruction: "Port 445 probes across a network are how [[ms17-010|MS17-010]] worms spread. Scan every SMB machine with the auxiliary detector, then confirm the one it flags with the exploit module's check, never its run.",
    network: NET,
    checks: [
      { id: 'scan', label: 'Scan every SMB machine', do: 'Type `msfconsole`, then `use auxiliary/scanner/smb/smb_ms17_010`, `set RHOSTS 10.0.9.0/24` and `run`.', learned: 'The detector asks each SMB server one question and reads the error: likely vulnerable or not.' },
      { id: 'check', label: 'Confirm the flagged one', do: 'Type `use exploit/windows/smb/ms17_010_eternalblue`, then `set RHOSTS` followed by the address the scan flagged, and `check`.', learned: 'Two independent methods agreeing is how a finding becomes confirmed.' },
      { id: 'answer', label: 'Submit the machine', do: 'Type `submit` followed by the confirmed address.', learned: 'Isolate it today, patch or replace it after: Windows 7 has had no updates since January 2020.' },
    ],
    goals: [
      { id: 'scan', facts: [`msf-run:auxiliary/scanner/smb/smb_ms17_010:${P.lan}.0/24`] },
      { id: 'check', facts: [`msf-check:${at(P.win)}:vulnerable`] },
      { id: 'answer', answers: [at(P.win), 'scanstation.dock.lan'] },
    ],
    wrong: [
      { answers: [at(P.winOk)], reason: 'Windows Server 2022 does not speak SMBv1 and the detector cleared it.' },
      { answers: [at(P.nas)], reason: 'That is Samba on Linux: MS17-010 is a Windows flaw.' },
    ],
    otherwise: 'Submit the address the smb_ms17_010 scan flagged and check confirmed.',
    showMe: [
      { say: 'Open the console.', act: { type: 'msfconsole', run: true } },
      { say: 'The MS17-010 detector.', act: { type: 'use auxiliary/scanner/smb/smb_ms17_010', run: true } },
      { say: 'Every machine.', act: { type: `set RHOSTS ${P.lan}.0/24`, run: true } },
      { say: 'Scan.', act: { type: 'run', run: true } },
      { say: 'The exploit module, for its check only.', act: { type: 'use exploit/windows/smb/ms17_010_eternalblue', run: true } },
      { say: 'The flagged machine.', act: { type: `set RHOSTS ${at(P.win)}`, run: true } },
      { say: 'Confirm.', act: { type: 'check', run: true } },
      { say: 'Confirmed.', act: { type: `submit ${at(P.win)}` } },
    ],
    realName: 'Validating MS17-010 safely',
    didWhat: 'You found and confirmed an EternalBlue-vulnerable machine without firing a thing.',
    codex: ['ms17-010'],
    xp: 160,
    par: 260,
  },
];
