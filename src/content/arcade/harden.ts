// The pairs in Harden Up, The Basics' bonus round: two versions of the same
// thing on lab-01, side by side (a file's permissions, a listening port, a
// service, a firewall rule, a network layout), and the question an admin asks
// every day: which one is locked down? Tier 3 pairs differ in one small
// detail that changes everything.

import type { CardLine } from './forgery';

export interface HardenPair {
  id: string;
  tier: 1 | 2 | 3;
  topic: string;
  /** The locked-down version. */
  first: CardLine[];
  /** The open one. */
  later: CardLine[];
  why: string;
  rule: string;
}

const ls = (line: string): CardLine[] => [{ label: 'ls -l', value: line }];
const ss = (line: string, who: string): CardLine[] => [
  { label: 'ss -tlnp', value: line },
  { label: 'Process', value: who },
];

export const HARDEN_PAIRS: HardenPair[] = [
  // ---- Tier 1: one line, plainly different --------------------------------------
  {
    id: 'env-600',
    tier: 1,
    topic: 'The shop\'s secrets file',
    first: ls('-rw------- deploy deploy .env'),
    later: ls('-rw-r--r-- deploy deploy .env'),
    why: 'The last r in rw-r--r-- lets every account on the box read the database password and API keys. rw------- is the owner only.',
    rule: 'Secrets are 600: owner read and write, nobody else anything.',
  },
  {
    id: 'redis-bind',
    tier: 1,
    topic: 'Redis, the cache',
    first: ss('LISTEN 127.0.0.1:6379', 'redis-server'),
    later: ss('LISTEN 0.0.0.0:6379', 'redis-server'),
    why: '0.0.0.0 answers every network the box is on. 127.0.0.1 only answers programs on the box itself, which is all a local cache needs.',
    rule: 'Bind what only local programs use to 127.0.0.1.',
  },
  {
    id: 'ufw-default',
    tier: 1,
    topic: 'The firewall\'s default',
    first: [{ label: 'ufw status verbose', value: 'Default: deny (incoming)' }],
    later: [{ label: 'ufw status verbose', value: 'Default: allow (incoming)' }],
    why: 'With allow by default, every port without a rule is open. Deny by default means only what you allowed gets in.',
    rule: 'Deny incoming by default, then allow what you need.',
  },
  {
    id: 'script-777',
    tier: 1,
    topic: 'The deploy script',
    first: ls('-rwxr-xr-x deploy deploy deploy.sh'),
    later: ls('-rwxrwxrwx deploy deploy deploy.sh'),
    why: 'rwxrwxrwx (777) lets anyone rewrite a script that you run. 755 keeps writing to the owner; others may only read and run it.',
    rule: 'Nothing anyone else will run should be writable by others.',
  },
  {
    id: 'ssh-source',
    tier: 1,
    topic: 'Who may reach SSH',
    first: [{ label: 'ufw rule', value: '22/tcp  ALLOW IN  192.168.40.0/24' }],
    later: [{ label: 'ufw rule', value: '22/tcp  ALLOW IN  Anywhere' }],
    why: 'From Anywhere, every password-guessing bot on the internet can try. From the office network only, they never reach the login.',
    rule: 'Admin ports open to your own network, never to Anywhere.',
  },
  {
    id: 'https-only',
    tier: 1,
    topic: 'Ports open on the web server',
    first: [{ label: 'nmap', value: '22/tcp filtered, 443/tcp open' }],
    later: [{ label: 'nmap', value: '22/tcp open, 443/tcp open, 6379/tcp open' }],
    why: 'From the internet, the public site needs 443 and nothing else. Every extra open port is another service an attacker can try.',
    rule: 'Each open port must have a reason to be open.',
  },
  // ---- Tier 2: you need the rule ----------------------------------------------------
  {
    id: 'disabled-too',
    tier: 2,
    topic: 'A service you switched off',
    first: [{ label: 'systemctl status', value: 'inactive (dead); disabled' }],
    later: [{ label: 'systemctl status', value: 'inactive (dead); enabled' }],
    why: 'Stopped but still enabled starts again at the next reboot. disable --now stops it and keeps it stopped.',
    rule: 'Stop it now and disable it for the next boot.',
  },
  {
    id: 'own-user',
    tier: 2,
    topic: 'Who a service runs as',
    first: [{ label: 'ps aux', value: 'redis   812  /usr/bin/redis-server' }],
    later: [{ label: 'ps aux', value: 'root    812  /usr/bin/redis-server' }],
    why: 'A bug in a service running as root hands the attacker the whole box. Running as its own user, it hands over only that service.',
    rule: 'Services run as their own unprivileged users, never root.',
  },
  {
    id: 'guest-printer',
    tier: 2,
    topic: 'Where the printer sits',
    first: [
      { label: 'Guest Wi-Fi', value: '192.168.40.192/27' },
      { label: 'Printer', value: '192.168.40.120' },
    ],
    later: [
      { label: 'Guest Wi-Fi', value: '192.168.40.192/27' },
      { label: 'Printer', value: '192.168.40.201' },
    ],
    why: 'The /27 runs from .192 to .223, so .201 is on the guest Wi-Fi, reachable by every visitor. .120 is on the office side.',
    rule: 'Keep guests and office machines in separate ranges.',
  },
  {
    id: 'ssh-key',
    tier: 2,
    topic: 'Your SSH private key',
    first: ls('-rw------- deploy deploy id_ed25519'),
    later: ls('-rw-r--r-- deploy deploy id_ed25519'),
    why: 'A private key anyone can read is a key anyone can copy. ssh itself refuses to use one with permissions this open.',
    rule: 'Private keys are 600, like any secret.',
  },
  {
    id: 'snmp-public',
    tier: 2,
    topic: 'SNMP on the router',
    first: [
      { label: 'nmap -sU', value: '161/udp closed snmp' },
      { label: 'Admin', value: 'over SSH from the office' },
    ],
    later: [
      { label: 'nmap -sU', value: '161/udp open snmp (public)' },
      { label: 'Admin', value: 'over SSH from the office' },
    ],
    why: 'SNMP with the community "public" hands its configuration to anyone who asks. It is UDP, so a TCP-only scan never shows it.',
    rule: 'Scan UDP too, and turn off what nobody uses.',
  },
  {
    id: 'log-read',
    tier: 2,
    topic: 'The SSH login log',
    first: ls('-rw-r----- syslog adm auth.log'),
    later: ls('-rw-r--r-- syslog adm auth.log'),
    why: 'auth.log names every account and address that logged in. Readable by the adm group is enough for the admins; readable by all tells any user who to target.',
    rule: 'Logs are for admins: no read for others.',
  },
  // ---- Tier 3: one small detail -------------------------------------------------------
  {
    id: 'rule-order',
    tier: 3,
    topic: 'Blocking one attacker',
    first: [
      { label: 'Rule 1', value: '22/tcp  DENY IN   198.51.100.66' },
      { label: 'Rule 2', value: '22/tcp  ALLOW IN  192.168.40.0/24' },
    ],
    later: [
      { label: 'Rule 1', value: '22/tcp  ALLOW IN  Anywhere' },
      { label: 'Rule 2', value: '22/tcp  DENY IN   198.51.100.66' },
    ],
    why: 'ufw stops at the first rule that matches. Allow from Anywhere first means the deny below it is never reached.',
    rule: 'First match wins: specific denies above broad allows.',
  },
  {
    id: 'cidr-size',
    tier: 3,
    topic: 'The office SSH rule',
    first: [{ label: 'ufw rule', value: '22/tcp  ALLOW IN  192.168.40.0/24' }],
    later: [{ label: 'ufw rule', value: '22/tcp  ALLOW IN  192.168.0.0/16' }],
    why: 'A /24 is 256 addresses, the office. A /16 is 65,536, every 192.168 network you route to, guests and partners included.',
    rule: 'Read the prefix: each bit fewer doubles who you let in.',
  },
  {
    id: 'v6-any',
    tier: 3,
    topic: 'The database',
    first: ss('LISTEN [::1]:5432', 'postgres'),
    later: ss('LISTEN [::]:5432', 'postgres'),
    why: '[::1] is IPv6 for this machine only, like 127.0.0.1. [::] is IPv6 for every address, like 0.0.0.0, and often IPv4 too.',
    rule: '[::1] is local, [::] is everyone.',
  },
  {
    id: 'port-specific',
    tier: 3,
    topic: 'Letting the office in',
    first: [{ label: 'ufw rule', value: '22/tcp      ALLOW IN  192.168.40.0/24' }],
    later: [{ label: 'ufw rule', value: 'Anywhere    ALLOW IN  192.168.40.0/24' }],
    why: 'The second rule opens every port to the office, including the database and anything installed later. The first opens SSH only.',
    rule: 'Allow the port, not the whole machine.',
  },
  {
    id: 'group-write',
    tier: 3,
    topic: 'The nginx config',
    first: ls('-rw-r--r-- root root nginx.conf'),
    later: ls('-rw-rw-r-- root www-data nginx.conf'),
    why: 'Group write for www-data means the web server user can rewrite its own config. A hole in the site becomes a changed server.',
    rule: 'The program that reads a config should not be able to write it.',
  },
];

export const HARDEN_BY_ID = Object.fromEntries(HARDEN_PAIRS.map((p) => [p.id, p])) as Record<string, HardenPair>;
