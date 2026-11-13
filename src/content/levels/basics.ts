import type { TerminalLevel } from '../types';
import { OFFICE, authLog, labServer, officeNetwork, officeRouter, workstation, type OfficePlan } from '../boxes';
import type { LinuxBox, Network } from '../../sim/terminal';

export const officeNotes = (p: OfficePlan) =>
  `The Watch, office network\n\nOffice LAN:     ${p.lan}.0/24\nGuest Wi-Fi:    ${p.lan}.${p.guest.start}/${p.guest.bits}  (cut from the top of the office block on the router)\nRouter:         ${p.lan}.1\nPrinter:        ${p.lan}.${p.printer}\nPublic name:    ${p.domain}`;

export function subnetNet(p: OfficePlan): Network {
  return officeNetwork(p, workstation(p, officeNotes(p)), officeRouter(p));
}

export function natNet(p: OfficePlan): Network {
  const notes = `${officeNotes(p)}\n\nMessage from Lantern's IT: "Send us the address your tests will come from and we will allow it through our firewall."`;
  return officeNetwork(p, workstation(p, notes), officeRouter(p));
}

export function udpNet(p: OfficePlan, snmp = 161): Network {
  return officeNetwork(p, workstation(p, officeNotes(p)), officeRouter(p, snmp));
}

export function labNet(p: OfficePlan, box: LinuxBox): Network {
  return { cidr: `${p.lan}.0/24`, hosts: [], dns: {}, whois: {}, files: {}, box };
}

export function permsBox(p: OfficePlan): LinuxBox {
  const box = labServer(p);
  box.files['/srv/shop/deploy.sh']!.mode = 0o777;
  return box;
}

export function servicesBox(p: OfficePlan, port = 6379): LinuxBox {
  const box = labServer(p);
  box.services.push({
    unit: 'redis-server',
    description: 'Advanced key-value store',
    process: `/usr/bin/redis-server`,
    user: 'redis',
    pid: 812,
    enabled: true,
    active: true,
    listen: [{ proto: 'tcp', addr: '0.0.0.0', port }],
  });
  return box;
}

export function firewallBox(p: OfficePlan): LinuxBox {
  const box = labServer(p);
  box.files['/var/log/auth.log']!.body = authLog(p);
  box.want = { 22: 'office-only', 443: 'public', 80: 'closed', 5432: 'closed' };
  return box;
}

const P = OFFICE;
const GUEST = `${P.lan}.${P.guest.start}/${P.guest.bits}`;

export const BASICS_LEVELS: TerminalLevel[] = [
  {
    id: 'net-subnet',
    zone: 'basics',
    kind: 'terminal',
    manual: 'ipcalc',
    title: 'Where the office ends',
    goal: 'Submit how many devices the guest Wi-Fi can hold, then whether the printer is on it.',
    instruction: 'A network is a block of addresses written like 192.168.40.0/24, called [[subnets|CIDR notation]]. ipcalc works out where a block starts and ends, and your notes list the office blocks.',
    network: subnetNet(P),
    checks: [
      {
        id: 'notes',
        label: 'Read the network notes',
        do: 'Click the prompt at the bottom of the Terminal panel, type `cat notes.txt` and press Enter. It lists the office network and the guest Wi-Fi.',
        learned: 'The /24 and /27 say how many leading bits of the address are the same for the whole network.',
      },
      {
        id: 'office',
        label: 'Work out the office range',
        do: 'Type `ipcalc 192.168.40.0/24` and press Enter. Read HostMin, HostMax and Hosts/Net.',
        learned: 'A /24 leaves 8 bits for devices: 256 addresses, minus the network and broadcast addresses, is 254.',
      },
      {
        id: 'guest',
        label: 'Work out the guest range',
        do: 'Type `ipcalc 192.168.40.192/27` and press Enter. Read Hosts/Net, and the HostMin to HostMax range.',
        learned: 'Each extra bit halves the block, so a /27 is 32 addresses and 30 usable ones.',
      },
      {
        id: 'count',
        label: 'Submit the guest size',
        do: 'Type `submit` followed by the Hosts/Net number of the /27, and press Enter.',
        learned: 'The first address names the network and the last is the broadcast, so neither can go to a device.',
      },
      {
        id: 'printer',
        label: 'Is the printer on the guest Wi-Fi?',
        do: 'The printer is 192.168.40.201. If it falls between the /27\'s HostMin and HostMax, type `submit yes`; if not, type `submit no`.',
        learned: "A printer on the guest range answers every visitor's phone, a classic mistake in a flat network.",
      },
    ],
    goals: [
      { id: 'notes', facts: ['cat:notes.txt'] },
      { id: 'office', facts: [`ipcalc:${P.lan}.0/24`] },
      { id: 'guest', facts: [`ipcalc:${GUEST}`] },
      { id: 'count', answers: ['30'] },
      { id: 'printer', answers: ['yes', 'y'] },
    ],
    wrong: [
      { answers: ['32'], reason: 'A /27 is 32 addresses, but the first is the network address and the last the broadcast. Submit Hosts/Net.' },
      { answers: ['254', '256'], reason: 'That is the whole office /24. Run ipcalc on the guest /27 and submit its Hosts/Net.' },
      { answers: ['no', 'n'], reason: '192.168.40.201 is between HostMin 192.168.40.193 and HostMax 192.168.40.222, so it is on the guest range.' },
    ],
    otherwise: 'Not that. Submit the Hosts/Net number of the /27, or yes or no for the printer.',
    showMe: [
      { say: 'Read the notes.', act: { type: 'cat notes.txt', run: true } },
      { say: 'The office block.', act: { type: 'ipcalc 192.168.40.0/24', run: true } },
      { say: 'The guest block: 30 usable, .193 to .222.', act: { type: 'ipcalc 192.168.40.192/27', run: true } },
      { say: 'Thirty devices.', act: { type: 'submit 30', run: true } },
      { say: '.201 is inside .193 to .222.', act: { type: 'submit yes' } },
    ],
    realName: 'Subnetting with CIDR',
    didWhat: 'You read two CIDR blocks and found a printer sitting on the guest Wi-Fi.',
    codex: ['subnets'],
    xp: 70,
    par: 90,
  },
  {
    id: 'net-dns-nat',
    zone: 'basics',
    kind: 'terminal',
    manual: 'ip',
    title: 'Two addresses',
    goal: "Lantern will allow-list the address our tests come from. Submit the one their firewall will see.",
    instruction: 'Office machines use [[nat|private addresses]] that never travel on the internet; the router swaps them for one public address on the way out. [[dns|DNS]] then gives that public address a name.',
    network: natNet(P),
    checks: [
      {
        id: 'local',
        label: 'Find your own address',
        do: 'At the terminal prompt, type `ip addr` and press Enter. The `inet` line under eth0 is this workstation\'s address.',
        learned: '192.168.x.x is a private range: used inside buildings, never routed on the internet.',
      },
      {
        id: 'route',
        label: 'Find the router',
        do: 'Type `ip route` and press Enter. The address after `default via` is the router everything leaves through.',
        learned: 'The default route is the router: anything not on the local network is handed to it.',
      },
      {
        id: 'public',
        label: 'Ask the internet who you are',
        do: 'Type `curl ifconfig.me` and press Enter. That website replies with the address your request arrived from.',
        learned: 'The world sees the router\'s address because the router rewrote yours on the way out, which is what NAT means.',
      },
      {
        id: 'dns',
        label: 'Check our name points there',
        do: 'Type `dig watch.example +short` and press Enter. Our domain\'s A record should give the same public address.',
        learned: 'An A record maps a name to an address, so Lantern can check the address really is ours.',
      },
      {
        id: 'answer',
        label: 'Submit the address Lantern will see',
        do: 'Type `submit` followed by the public address and press Enter.',
        learned: 'A client allow-lists your public address; your private one never reaches them.',
      },
    ],
    goals: [
      { id: 'local', facts: ['ip-addr'] },
      { id: 'route', facts: ['ip-route'] },
      { id: 'public', facts: ['public-ip'] },
      { id: 'dns', facts: [`dig:${P.domain}`] },
      { id: 'answer', answers: [P.publicIp] },
    ],
    wrong: [
      { answers: [`${P.lan}.${P.me}`], reason: 'That is your private address. The router replaces it before anything leaves the office, so Lantern never sees it. Submit what curl ifconfig.me printed.' },
      { answers: [`${P.lan}.1`], reason: 'That is the router\'s inside address. Submit its public one, the address curl ifconfig.me printed.' },
    ],
    otherwise: 'Not that address. Submit what curl ifconfig.me printed.',
    showMe: [
      { say: 'Your address on the office network.', act: { type: 'ip addr', run: true } },
      { say: 'The router.', act: { type: 'ip route', run: true } },
      { say: 'What the internet sees.', act: { type: 'curl ifconfig.me', run: true } },
      { say: 'Our name points at the same address.', act: { type: 'dig watch.example +short', run: true } },
      { say: 'That is the one to allow-list.', act: { type: `submit ${P.publicIp}` } },
    ],
    realName: 'Private addressing, NAT and DNS',
    didWhat: 'You told your private address from your public one, and checked the name that points at it.',
    codex: ['nat', 'dns'],
    xp: 80,
    par: 100,
  },
  {
    id: 'net-tcp-udp',
    zone: 'basics',
    kind: 'terminal',
    manual: 'nmap',
    title: 'The quiet port',
    goal: 'The office router runs a service a normal scan never sees. Find it and submit its port number.',
    instruction: '[[tcp-udp|TCP]] services answer a handshake, and a default nmap scan only looks for those. UDP services have no handshake, so they need their own slower scan.',
    network: udpNet(P),
    checks: [
      {
        id: 'tcp',
        label: 'Scan the router over TCP',
        do: 'At the terminal prompt, type `nmap 192.168.40.1` and press Enter. Note the TCP ports it finds.',
        learned: 'nmap scans TCP by default because a handshake gives a clear yes or no.',
      },
      {
        id: 'udp',
        label: 'Scan it over UDP',
        do: 'Type `sudo nmap -sU 192.168.40.1` and press Enter. A UDP scan needs root, so sudo goes in front.',
        learned: 'With no handshake, a UDP port that never replies shows open|filtered, because nmap cannot tell.',
      },
      {
        id: 'answer',
        label: 'Submit the port only UDP found',
        do: 'Find the UDP port marked `open` that was not in the TCP list. Type `submit` followed by its number.',
        learned: "SNMP on UDP 161 with the community 'public' can hand out a device's whole configuration.",
      },
    ],
    goals: [
      { id: 'tcp', facts: [`ports:${P.lan}.1`] },
      { id: 'udp', facts: [`uports:${P.lan}.1`] },
      { id: 'answer', answers: ['161', '161/udp', 'snmp'] },
    ],
    wrong: [
      { answers: ['53', '53/udp'], reason: 'DNS answers on TCP 53 as well, so the first scan already showed it. Submit the UDP port that only the second scan found.' },
      { answers: ['123', '123/udp'], reason: 'open|filtered means nothing came back, so nmap cannot say it is open. Submit the one marked plainly open.' },
      { answers: ['80', '22'], reason: 'That is a TCP port the normal scan found. Submit the UDP-only one.' },
    ],
    otherwise: 'Not that one. Submit the port number of the UDP service marked open that TCP did not show.',
    showMe: [
      { say: 'The normal scan: TCP only.', act: { type: 'nmap 192.168.40.1', run: true } },
      { say: 'Now UDP, as root.', act: { type: 'sudo nmap -sU 192.168.40.1', run: true } },
      { say: 'SNMP on 161 never showed on TCP.', act: { type: 'submit 161' } },
    ],
    realName: 'TCP and UDP port scanning',
    didWhat: 'You found an SNMP service that a TCP-only scan would have missed.',
    codex: ['tcp-udp'],
    xp: 90,
    par: 110,
  },
  {
    id: 'linux-perms',
    zone: 'basics',
    kind: 'terminal',
    manual: 'chmod',
    title: 'Who can read the keys',
    goal: "Lock the shop's secrets file and its deploy script on lab-01 so other accounts cannot read or change them.",
    instruction: "You are logged in to lab-01, the Watch's practice server, where every file has an owner and [[linux-permissions|permissions]] for owner, group and everyone else. Check them, fix the two wrong ones, and check again.",
    network: labNet(P, permsBox(P)),
    checks: [
      {
        id: 'look',
        label: 'List the files and their permissions',
        do: 'At the terminal prompt, type `ls -la` and press Enter. -l shows permissions, -a shows hidden files like `.env`, whose line starts `-rw-r--r--`.',
        learned: 'rw-r--r-- reads as owner read and write, group read, everyone else read.',
      },
      {
        id: 'env',
        label: 'Make .env readable by its owner only',
        do: 'Type `chmod 600 .env` and press Enter. 6 is read (4) plus write (2) for you, the owner; the two zeros take everything from group and others.',
        learned: 'You own the file, so you can change it without sudo.',
      },
      {
        id: 'script',
        label: 'Stop others rewriting deploy.sh',
        do: '`deploy.sh` is `-rwxrwxrwx`: anyone can edit a script you run. Type `chmod 755 deploy.sh` and press Enter: you keep everything, others can only read and run it.',
        learned: 'A script anyone can write runs whatever they put in it, with the rights of whoever runs it next.',
      },
      {
        id: 'verify',
        label: 'Check the result',
        do: 'Type `ls -la` again and press Enter. `.env` should start `-rw-------` and `deploy.sh` `-rwxr-xr-x`.',
        learned: 'The fix is what ls shows, not what you typed: always look again.',
      },
    ],
    goals: [
      { id: 'look', facts: ['ls:.env'] },
      { id: 'env', facts: ['chmod-private:.env'] },
      { id: 'script', facts: ['chmod-nowrite:deploy.sh'] },
      { id: 'verify', facts: ['private:.env'] },
    ],
    wrong: [],
    otherwise: 'Nothing to submit here: change the permissions and check them with ls -la.',
    showMe: [
      { say: 'See the permissions, hidden files included.', act: { type: 'ls -la', run: true } },
      { say: 'Owner only on .env.', act: { type: 'chmod 600 .env', run: true } },
      { say: 'Nobody else may rewrite the script.', act: { type: 'chmod 755 deploy.sh', run: true } },
      { say: 'Check.', act: { type: 'ls -la', run: true } },
    ],
    realName: 'Linux file permissions',
    didWhat: 'You read rwx permissions, closed a world-readable secrets file and a world-writable script.',
    codex: ['linux-permissions'],
    xp: 90,
    par: 100,
  },
  {
    id: 'linux-services',
    zone: 'basics',
    kind: 'terminal',
    manual: 'ss',
    title: 'Listening to everyone',
    goal: 'Redis on lab-01 answers the whole network and nothing uses it. Stop it now and for good, and prove the port is closed.',
    instruction: 'A [[linux-services|service]] is a program systemd starts at boot and keeps running, often listening on a port. Find what listens where, then switch off the one that should not be there.',
    network: labNet(P, servicesBox(P)),
    checks: [
      {
        id: 'procs',
        label: 'List the running processes',
        do: 'At the terminal prompt, type `ps aux` and press Enter. Find `redis-server` and the user it runs as.',
        learned: 'Every running program is a process with an owner and a process id, its PID.',
      },
      {
        id: 'sockets',
        label: 'See what listens, and to whom',
        do: 'Type `sudo ss -tlnp` and press Enter. Read the Local Address column: `0.0.0.0:6379` is Redis, `127.0.0.1:5432` is the database.',
        learned: '0.0.0.0 means every network the box is on, while 127.0.0.1 only answers the box itself.',
      },
      {
        id: 'off',
        label: 'Stop and disable Redis',
        do: 'Type `sudo systemctl disable --now redis-server` and press Enter, then `systemctl status redis-server`. It should say `disabled` and `inactive (dead)`.',
        learned: 'stop ends it now and disable stops it coming back at the next boot; --now does both.',
      },
      {
        id: 'closed',
        label: 'Prove the port is closed',
        do: 'Type `sudo ss -tlnp` again and press Enter. 6379 should be gone, with 22, 80, 443 and 5432 still there.',
        learned: 'A service that is not running cannot be attacked, the cheapest fix there is.',
      },
    ],
    goals: [
      { id: 'procs', facts: ['proc:redis-server'] },
      { id: 'sockets', facts: ['exposed:6379'] },
      { id: 'off', facts: ['off:redis-server'] },
      { id: 'closed', facts: ['closed:6379'] },
    ],
    wrong: [],
    otherwise: 'Nothing to submit here: stop the service and check with ss.',
    showMe: [
      { say: 'What runs.', act: { type: 'ps aux', run: true } },
      { say: 'What listens, and on which address.', act: { type: 'sudo ss -tlnp', run: true } },
      { say: 'Off now, and off at boot.', act: { type: 'sudo systemctl disable --now redis-server', run: true } },
      { say: 'Confirm.', act: { type: 'systemctl status redis-server', run: true } },
      { say: 'And the port is gone.', act: { type: 'sudo ss -tlnp', run: true } },
    ],
    realName: 'Processes, listening ports and systemd services',
    didWhat: 'You found a service open to the network that nobody used, and switched it off for good.',
    codex: ['linux-services'],
    xp: 100,
    par: 120,
  },
  {
    id: 'linux-firewall',
    zone: 'basics',
    kind: 'terminal',
    manual: 'ufw',
    boss: true,
    title: 'Close the door',
    goal: 'lab-01 is being guessed at over SSH from the internet. Firewall it: SSH from the office only, HTTPS for everyone, nothing else.',
    instruction: "A host [[host-firewall|firewall]] decides which connections reach the box at all, and lab-01 has none switched on. You are connected over SSH from the office, so the order you do this in matters.",
    network: labNet(P, firewallBox(P)),
    checks: [
      {
        id: 'log',
        label: 'Read the attack in the log',
        do: 'At the terminal prompt, type `sudo tail /var/log/auth.log` and press Enter. Each `Failed password` line is one guess, all from the same internet address.',
        learned: 'auth.log records every SSH login, and many failures from one address is a brute-force attack.',
      },
      {
        id: 'deny',
        label: 'Block everything by default',
        do: 'Type `sudo ufw default deny incoming` and press Enter. From now on nothing new gets in unless a rule allows it.',
        learned: 'Deny by default, then allow only what you need: the idea behind every good firewall.',
      },
      {
        id: 'ssh',
        label: 'Keep SSH for the office',
        do: 'Type `sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp` and press Enter. This is the rule that keeps your own session alive.',
        learned: 'A source address in a rule narrows who may connect, not just which port is open.',
      },
      {
        id: 'https',
        label: 'Open HTTPS to everyone',
        do: 'Type `sudo ufw allow 443/tcp` and press Enter. The shop must stay reachable.',
        learned: 'A public website needs its port open to anyone; SSH and the database do not.',
      },
      {
        id: 'enable',
        label: 'Switch the firewall on',
        do: 'Type `sudo ufw enable` and press Enter. Only now, with your SSH rule in place, is it safe.',
        learned: 'Enabling a deny-by-default firewall over SSH before allowing yourself is how people lock themselves out.',
      },
      {
        id: 'verify',
        label: 'Check it does what you meant',
        do: 'Type `sudo ufw status verbose` and press Enter. You want `Default: deny (incoming)`, 22 from 192.168.40.0/24 and 443 from Anywhere, nothing more.',
        learned: 'Read the rules back every time: one stray allow undoes the whole policy.',
      },
    ],
    goals: [
      { id: 'log', facts: ['read:/var/log/auth.log'] },
      { id: 'deny', facts: ['set:default-deny', 'fw:default-deny'] },
      { id: 'ssh', facts: [`ufw-rule:allow:22:${P.lan}.0/24`, `ufw-rule:limit:22:${P.lan}.0/24`] },
      { id: 'https', facts: ['ufw-rule:allow:443:any'] },
      { id: 'enable', facts: ['ufw-on'] },
      { id: 'verify', facts: ['fw:as-planned'] },
    ],
    wrong: [],
    otherwise: 'Nothing to submit here: set the firewall up and check it with sudo ufw status verbose.',
    showMe: [
      { say: 'The attack, in the log.', act: { type: 'sudo tail /var/log/auth.log', run: true } },
      { say: 'Deny by default.', act: { type: 'sudo ufw default deny incoming', run: true } },
      { say: 'SSH from the office only, before anything else.', act: { type: `sudo ufw allow from ${P.lan}.0/24 to any port 22 proto tcp`, run: true } },
      { say: 'HTTPS for the shop.', act: { type: 'sudo ufw allow 443/tcp', run: true } },
      { say: 'Now it is safe to switch on.', act: { type: 'sudo ufw enable', run: true } },
      { say: 'Read it back.', act: { type: 'sudo ufw status verbose', run: true } },
    ],
    realName: 'Host firewall hardening with ufw',
    didWhat: 'You stopped a brute-force attack with a deny-by-default firewall, without locking yourself out.',
    codex: ['host-firewall'],
    xp: 150,
    par: 220,
  },
];
