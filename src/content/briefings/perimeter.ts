import type { Briefing } from '../types';

const M = 'Ines';

export const PERIMETER_BRIEFINGS: Briefing[] = [
  {
    missionId: 'perimeter-first-scan',
    mentor: M,
    beats: [
      {
        id: 'read-a-port',
        concepts: ['ports-services'],
        say: 'A host is a set of open ports, each with a service and a version. Here is a scan. The 443 line is the website, exactly what you expect. Tap it so you know what normal looks like.',
        material: {
          kind: 'lines',
          title: 'Scan output',
          lines: ['22/tcp open ssh OpenSSH 9.6p1', '443/tcp open https nginx 1.24.0', '3306/tcp open mysql MySQL 8.0.36'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Right, a web server answering on 443 is expected. Now compare it with the others.',
        codex: 'ports-and-services',
      },
      {
        id: 'exposed-db',
        concepts: ['exposed-db-port'],
        say: 'The 3306 line is MySQL, a database, answering the whole internet. That is a finding on its own, before any version or CVE. Tap it.',
        material: {
          kind: 'lines',
          title: 'Scan output',
          lines: ['22/tcp open ssh OpenSSH 9.6p1', '443/tcp open https nginx 1.24.0', '3306/tcp open mysql MySQL 8.0.36'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Right. Even fully patched, an exposed database is a password guess or a future CVE away from the data.',
        codex: 'nmap',
      },
      {
        id: 'network-fix',
        concepts: ['network-fix'],
        say: 'So what do you recommend first? The exposure itself is the finding. Pick the fix that actually closes it.',
        material: {
          kind: 'lines',
          title: 'The question',
          lines: ['MySQL on 3306 is reachable from the internet. First fix?'],
        },
        action: {
          kind: 'choose',
          options: ['Upgrade MySQL to the newest version', 'Restrict 3306 to the app server with a firewall rule', 'Change the port to 33060'],
          answer: 1,
        },
        then: 'Right. Patching helps and moving the port helps nobody; close the exposure at the network. Now run your first sweep.',
      },
    ],
  },
  {
    missionId: 'perimeter-versions',
    mentor: M,
    beats: [
      {
        id: 'spot-the-cve',
        concepts: ['version-cve'],
        say: 'With version detection on, a banner can point at a known hole. Apache httpd 2.4.49 is the one release with a critical path-traversal CVE. Tap that line.',
        material: {
          kind: 'lines',
          title: 'Scan output',
          lines: ['21/tcp open ftp vsftpd 3.0.5', '22/tcp open ssh OpenSSH 9.3p1', '80/tcp open http Apache httpd 2.4.49'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Right. 2.4.49 has CVE-2021-41773. vsftpd and OpenSSH here have nothing comparable.',
        codex: 'cve',
      },
      {
        id: 'what-is-a-cve',
        concepts: ['cve-lookup'],
        say: 'A CVE is a public id for one specific vulnerability, like CVE-2021-41773. It tells you what the flaw is and which versions it affects. Which of these is the Apache one?',
        material: {
          kind: 'lines',
          title: 'The finding',
          lines: ['Apache httpd 2.4.49: path traversal, RCE where mod_cgi is on'],
        },
        action: { kind: 'choose', options: ['CVE-2021-41773', 'CVE-2014-0160', 'CVE-2021-44228'], answer: 0 },
        then: 'Right. The other two are Heartbleed and Log4Shell. Knowing the id lets you look up the exact affected range.',
      },
      {
        id: 'verify-first',
        concepts: ['verify-before-report'],
        say: 'A banner can lie: backports, modules off, a hardened config. Before you write "confirmed", what do you do?',
        material: {
          kind: 'lines',
          title: 'The question',
          lines: ['The banner says Apache 2.4.49. Next step before reporting?'],
        },
        action: {
          kind: 'choose',
          options: ['Trust the banner, it is proof enough', 'Send one controlled request and keep the evidence', 'Run every exploit you have'],
          answer: 1,
        },
        then: 'Right. A single non-destructive request confirms it and makes the finding reproducible. Now read the host.',
      },
    ],
  },
  {
    missionId: 'perimeter-nmap-flags',
    mentor: M,
    beats: [
      {
        id: 'scan-types',
        concepts: ['nmap-scan-types'],
        say: 'Scan Grammar is a timed sort of the flags you type every week. Start with scan types. -sS is the default half-open TCP scan. Which option does a UDP scan?',
        material: {
          kind: 'lines',
          title: 'Scan types',
          lines: ['-sS  TCP SYN scan (default)', '-sU  ... ?'],
        },
        action: { kind: 'choose', options: ['-sU', '-sV', '-sC'], answer: 0 },
        then: 'Right. -sU is UDP: slow, but DNS and SNMP live there.',
        codex: 'nmap',
      },
      {
        id: 'detection',
        concepts: ['nmap-detection'],
        say: 'Detection flags. -sV identifies the service and version. Which one guesses the operating system?',
        material: {
          kind: 'lines',
          title: 'Detection',
          lines: ['-sV  service and version', '-sC  default scripts', '-O   ... ?'],
        },
        action: { kind: 'choose', options: ['-O', '-p-', '-Pn'], answer: 0 },
        then: 'Right. -O is OS detection from the TCP/IP stack; -sC runs the default scripts.',
      },
      {
        id: 'ports-discovery',
        concepts: ['nmap-ports'],
        say: 'Scope flags. -p- scans all 65535 ports. Which one skips the ping and treats every host as up?',
        material: {
          kind: 'lines',
          title: 'Scope',
          lines: ['-p-  all 65535 ports', '-Pn  ... ?'],
        },
        action: { kind: 'choose', options: ['-Pn', '-sS', '-oA'], answer: 0 },
        then: 'Right. -Pn skips host discovery.',
      },
      {
        id: 'scripts-output',
        concepts: ['nmap-scripts-output'],
        say: 'Last group. --script vuln runs the NSE vuln scripts. Which flag saves output in all three formats at once?',
        material: {
          kind: 'lines',
          title: 'Scripts and output',
          lines: ['--script vuln   run the vuln scripts', '-oA report      ... ?'],
        },
        action: { kind: 'choose', options: ['-oA report', '-sV', '-O'], answer: 0 },
        then: 'Right. -oA writes normal, grepable and XML. Nmap finds things; it is not a vulnerability scanner. Now sort the flags.',
      },
    ],
  },
  {
    missionId: 'perimeter-cvss',
    mentor: M,
    beats: [
      {
        id: 'exploitability',
        concepts: ['cvss-exploitability'],
        say: 'CVSS turns a description into a score. The first group is how reachable the flaw is: vector, complexity, privileges, interaction. A flaw anyone on the internet can hit with no account is Network, no privileges. Pick that reading.',
        material: {
          kind: 'lines',
          title: 'Heartbleed, in words',
          lines: ['Anyone on the internet can send it, no account, no user action, trivially.'],
        },
        action: { kind: 'choose', options: ['AV:N, PR:N, UI:N', 'AV:L, PR:H, UI:R', 'AV:N, PR:H, UI:R'], answer: 0 },
        then: 'Right. Network, low complexity, no privileges, no interaction: as reachable as it gets.',
        codex: 'cvss',
      },
      {
        id: 'scope',
        concepts: ['cvss-scope'],
        say: 'Scope asks whether the flaw stays in the vulnerable component or breaks out of it. Log4Shell runs code beyond the logging library, across the whole host. Is scope changed or unchanged?',
        material: {
          kind: 'lines',
          title: 'Log4Shell, in words',
          lines: ['The vulnerable library lets code run with the whole application\'s reach.'],
        },
        action: { kind: 'choose', options: ['Scope changed (S:C)', 'Scope unchanged (S:U)'], answer: 0 },
        then: 'Right. When the thing that suffers is not the thing that is vulnerable, scope is changed, and that pushes the score up.',
      },
      {
        id: 'impact',
        concepts: ['cvss-impact'],
        say: 'The last group is impact on confidentiality, integrity and availability. Heartbleed reads memory but changes nothing and takes nothing down. Which impact set fits?',
        material: {
          kind: 'lines',
          title: 'Heartbleed impact',
          lines: ['It leaks keys and sessions, but cannot change or stop anything.'],
        },
        action: { kind: 'choose', options: ['C:H, I:N, A:N', 'C:H, I:H, A:H', 'C:N, I:N, A:H'], answer: 0 },
        then: 'Right: confidentiality high, the rest none, which is why Heartbleed is 7.5 and Log4Shell, with all three high and scope changed, is 10.0. Now set the dials.',
      },
    ],
  },
  {
    missionId: 'perimeter-triage',
    mentor: M,
    beats: [
      {
        id: 'backport',
        concepts: ['backport-false-positive'],
        say: 'A scanner keys on banners, and banners lie. Enterprise distributions backport fixes without changing the version. Given this evidence, what is the call?',
        material: {
          kind: 'lines',
          title: 'OpenSSH 7.4 flagged',
          lines: ['rpm shows openssh-7.4p1-23.el7_9', 'changelog lists the named CVEs as fixed by backport'],
        },
        action: { kind: 'choose', options: ['True positive', 'False positive', 'Needs validation'], answer: 1 },
        then: 'Right, false positive, documented with the package version. The banner said 7.4, but the fixes are in.',
        codex: 'false-positives',
      },
      {
        id: 'reproduced',
        concepts: ['reproduced-true-positive'],
        say: 'A test that reproduces the issue makes it a true positive. The handshake below completed with TLS 1.0. What is the call?',
        material: {
          kind: 'lines',
          title: 'TLS 1.0 on 443',
          lines: ['openssl s_client -tls1 completes the handshake', 'Protocol: TLSv1 in the output'],
        },
        action: { kind: 'choose', options: ['True positive', 'False positive', 'Needs validation'], answer: 0 },
        then: 'Right. Reproduced, so it is real. Evidence saved.',
        codex: 'scanner-principle',
      },
      {
        id: 'validate',
        concepts: ['needs-validation', 'version-range-false-positive'],
        say: 'When nothing has been tested yet, be honest: it needs validation. A 500 on a single quote is a hint, not proof. What is the call?',
        material: {
          kind: 'lines',
          title: 'Possible SQLi in /search',
          lines: ['A single quote returns HTTP 500', 'No boolean or time-based test done yet'],
        },
        action: { kind: 'choose', options: ['True positive', 'False positive', 'Needs validation'], answer: 2 },
        then: 'Right. Also watch version ranges: a CVE flagged on a version outside its affected range is a false positive. Now judge the list.',
      },
    ],
  },
  {
    missionId: 'perimeter-boss',
    mentor: M,
    beats: [
      {
        id: 'default-service',
        concepts: ['exposed-default-service'],
        say: 'The Second Host, no notes: sweep, score, judge. Some services ship with no password by default. Redis is one; exposed, it is immediate read and write. Which gives the most for the least effort?',
        material: {
          kind: 'lines',
          title: 'Open on the host',
          lines: ['3389/tcp RDP', '6379/tcp Redis 7.2.4 (no auth by default)', '9100/tcp node_exporter'],
        },
        action: { kind: 'choose', options: ['Redis on 6379', 'node_exporter on 9100', 'RDP on 3389'], answer: 0 },
        then: 'Right. RDP is serious too, but Redis with its default config is the quicker win.',
      },
      {
        id: 'one-per-exposure',
        concepts: ['one-finding-per-exposure'],
        say: 'How do you report the RDP and Redis exposures? Each has its own impact and its own fix. Pick the right shape.',
        material: {
          kind: 'lines',
          title: 'The question',
          lines: ['3389 and 6379 are both exposed. How many findings?'],
        },
        action: { kind: 'choose', options: ['One: "too many ports open"', 'Two, each with its own asset, impact and fix', 'None: the versions are current'],
          answer: 1,
        },
        then: 'Right. Current versions do not make an exposed admin or data service safe.',
      },
      {
        id: 'score-and-judge',
        concepts: ['cvss-impact', 'reproduced-true-positive', 'version-range-false-positive'],
        say: 'Then you score the Apache traversal and judge the overnight list. A BlueKeep alert on Windows Server 2022 is outside the affected range. What is the call?',
        material: {
          kind: 'lines',
          title: 'RDP BlueKeep flagged',
          lines: ['Host reports Windows Server 2022', 'BlueKeep affects the Windows 7 / 2008 generation'],
        },
        action: { kind: 'choose', options: ['True positive', 'False positive', 'Needs validation'], answer: 1 },
        then: 'Right, false positive on the range, though the RDP exposure itself still stands. Sweep, score, judge. Go.',
      },
    ],
  },
];
