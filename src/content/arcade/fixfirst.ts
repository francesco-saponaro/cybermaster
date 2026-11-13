// The pairs in Fix First: two real results from Lantern's scans, side by side,
// and the question every Monday morning asks: which one do you fix first?
// Each pair has one answer the method agrees on: severity first, then proof
// (QoD) over guesses, then who can reach it and what it holds.

import type { CardLine } from './forgery';

export interface FixPair {
  id: string;
  tier: 1 | 2 | 3;
  topic: string;
  /** The result to fix first. */
  first: CardLine[];
  /** The one that can wait. */
  later: CardLine[];
  why: string;
  rule: string;
}

const card = (finding: string, host: string, score: string, qod: string, reach: string): CardLine[] => [
  { label: 'Finding', value: finding },
  { label: 'Host', value: host },
  { label: 'Score', value: score },
  { label: 'QoD', value: qod },
  { label: 'Reachable from', value: reach },
];

export const FIX_PAIRS: FixPair[] = [
  // ---- Tier 1: the score decides ------------------------------------------------
  {
    id: 'ssh-vs-tls',
    tier: 1,
    topic: 'Two results on machines that face the internet',
    first: card('OpenSSH regreSSHion (CVE-2024-6387)', 'gw', 'High 8.1', '80%', 'The internet'),
    later: card('Deprecated TLS 1.0 and 1.1', 'web-01', 'Medium 4.3', '95%', 'The internet'),
    why: 'regreSSHion lets someone run code as root on the gateway with no login. Old TLS versions are a weakness, not an open door.',
    rule: 'Same exposure, same confidence: the higher score goes first.',
  },
  {
    id: 'samba-vs-telnet',
    tier: 1,
    topic: 'Two results inside the office',
    first: card('Samba remote code execution (SambaCry)', 'nas-01', 'High 9.8', '80%', 'The office network'),
    later: card('Telnet cleartext login', 'kiosk-01', 'Medium 4.8', '80%', 'The office network'),
    why: 'SambaCry gives anyone on the network a shell on the NAS. Telnet leaks passwords to someone listening, which is bad but slower to use.',
    rule: 'A flaw that runs code beats one that leaks a little.',
  },
  {
    id: 'eol-vs-log',
    tier: 1,
    topic: 'Two lines from the same NAS',
    first: card('Operating system end of life', 'nas-01', 'High 10.0', '80%', 'The office network'),
    later: card('OS Detection Consolidation and Reporting', 'nas-01', 'Log 0.0', '1%', 'The office network'),
    why: 'A Log result is information: here, which operating system the scanner thinks runs. The end-of-life result means no more security updates, ever.',
    rule: 'Log results are not problems to fix.',
  },
  {
    id: 'tls-vs-mac',
    tier: 1,
    topic: 'Two results on the web server',
    first: card('Deprecated TLS 1.0 and 1.1', 'web-01', 'Medium 4.3', '95%', 'The internet'),
    later: card('Weak MAC algorithms supported (SSH)', 'web-01', 'Low 2.6', '95%', 'The office network'),
    why: 'Both are configuration weaknesses, but the TLS one is on the public site and scores higher.',
    rule: 'Medium before Low.',
  },

  // ---- Tier 2: proof and reach ----------------------------------------------------
  {
    id: 'proof-vs-guess',
    tier: 2,
    topic: 'A guess and a proof',
    first: card('policykit-1 package (PwnKit)', 'db-02', 'High 7.8', '97%', 'Anyone with a login on db-02'),
    later: card('Apache HTTP Server < 2.4.53', 'web-01', 'High 9.8', '30%', 'The internet'),
    why: 'The Apache result only read a version from a banner that Ubuntu does not change when it patches: 30% means it may already be fixed, so check it. PwnKit was confirmed from inside with the package list.',
    rule: 'Fix what is proven; verify the guesses before spending a patch window on them.',
  },
  {
    id: 'internet-vs-office',
    tier: 2,
    topic: 'The same flaw on two machines',
    first: card('OpenSSH regreSSHion (CVE-2024-6387)', 'gw', 'High 8.1', '80%', 'The internet'),
    later: card('OpenSSH regreSSHion (CVE-2024-6387)', 'test-vm', 'High 8.1', '80%', 'The office network'),
    why: 'Same flaw, same score. Anyone on the internet can reach the gateway; only people already in the office can reach the test machine.',
    rule: 'Same score: the one more people can reach goes first.',
  },
  {
    id: 'remote-vs-local',
    tier: 2,
    topic: 'Two Highs, close in score',
    first: card('OpenSSH regreSSHion (CVE-2024-6387)', 'gw', 'High 8.1', '80%', 'The internet, no login'),
    later: card('sudo heap overflow (Baron Samedit)', 'db-02', 'High 7.8', '97%', 'Someone already logged in to db-02'),
    why: 'Baron Samedit needs an account on db-02 first. regreSSHion needs nothing but a connection to the gateway.',
    rule: 'No login needed beats a login needed.',
  },
  {
    id: 'fp-vs-real',
    tier: 2,
    topic: 'Two lines in this week\'s report',
    first: card('Deprecated TLS 1.0 and 1.1', 'web-01', 'Medium 4.3', '95%', 'The internet'),
    later: card('Apache HTTP Server < 2.4.53', 'web-01', 'False Positive (was 9.8)', '30%', 'The internet'),
    why: 'The Apache result was checked last week and overridden: Ubuntu backported the fix, and the reason is on the override. The TLS one is real.',
    rule: 'An override with a reason has been dealt with. The real Medium has not.',
  },

  // ---- Tier 3: the score is not the whole story --------------------------------------
  {
    id: 'exposed-nas',
    tier: 3,
    topic: 'The same flaw on two NAS boxes',
    first: card('Samba remote code execution (SambaCry)', 'nas-02', 'High 9.8', '80%', 'The internet (port 445 forwarded)'),
    later: card('Samba remote code execution (SambaCry)', 'nas-01', 'High 9.8', '80%', 'The office network'),
    why: 'Someone forwarded port 445 on the router to nas-02, so the whole internet can reach it. Worms scan for exactly that.',
    rule: 'Read the reach line: the same High means more when the internet can touch it.',
  },
  {
    id: 'data-vs-test',
    tier: 3,
    topic: 'The same flaw on two servers',
    first: card('policykit-1 package (PwnKit)', 'db-02 (customer orders)', 'High 7.8', '97%', 'Anyone with a login'),
    later: card('policykit-1 package (PwnKit)', 'test-vm (no data)', 'High 7.8', '97%', 'Anyone with a login'),
    why: 'Root on db-02 means the customer orders. Root on an empty test machine means very little.',
    rule: 'Same flaw, same proof: protect the machine that holds what matters.',
  },
  {
    id: 'reach-over-score',
    tier: 3,
    topic: 'A higher score inside, a lower one outside',
    first: card('OpenSSH regreSSHion (CVE-2024-6387)', 'gw', 'High 8.1', '80%', 'The internet, no login'),
    later: card('apache2 package out of date', 'intranet', 'High 9.8', '97%', 'The office network only'),
    why: 'Both are serious. The intranet one scores higher, but only people inside the office can reach it; the gateway is in front of the whole internet and needs no login.',
    rule: 'Close scores: exposure decides.',
  },
  {
    id: 'package-vs-banner',
    tier: 3,
    topic: 'One flaw, two ways of knowing',
    first: card('apache2 package out of date', 'intranet', 'High 9.8', '97%', 'The office network'),
    later: card('Apache HTTP Server < 2.4.53', 'web-02', 'High 9.8', '30%', 'The office network'),
    why: 'Same flaw, same score. On the intranet the scanner logged in and read the old package: confirmed. On web-02 it only read a banner.',
    rule: 'Same score: the confirmed one first, then go and check the guess.',
  },
];

export const FIX_BY_ID = Object.fromEntries(FIX_PAIRS.map((p) => [p.id, p])) as Record<string, FixPair>;
