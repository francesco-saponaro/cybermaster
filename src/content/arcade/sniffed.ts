// The pairs in Sniffed, The Capture's bonus round: the same action seen in two
// captures, side by side, as Wireshark would show it. Which one gives more
// away to someone listening on the network? Tier 3 pairs are both encrypted
// or both plain, and one detail decides.

import type { CardLine } from './forgery';

export interface SniffPair {
  id: string;
  tier: 1 | 2 | 3;
  topic: string;
  /** The capture that leaks. */
  first: CardLine[];
  /** The one that keeps it. */
  later: CardLine[];
  why: string;
  rule: string;
}

const pk = (proto: string, info: string, follow: string): CardLine[] => [
  { label: 'Protocol', value: proto },
  { label: 'Info', value: info },
  { label: 'Follow TCP Stream', value: follow },
];

export const SNIFF_PAIRS: SniffPair[] = [
  // ---- Tier 1: plain against encrypted ---------------------------------------------
  {
    id: 'login-http',
    tier: 1,
    topic: 'A staff login',
    first: pk('HTTP', 'POST /admin/login HTTP/1.1', 'user=theo&pass=Lanterne2019'),
    later: pk('TLSv1.3', 'Application Data', '(encrypted)'),
    why: 'Over HTTP the form crosses the Wi-Fi as text: user and password. Over TLS the same login is unreadable bytes.',
    rule: 'Anything with a password goes over HTTPS, always.',
  },
  {
    id: 'cookie-http',
    tier: 1,
    topic: 'Opening the account page',
    first: pk('HTTP', 'GET /account HTTP/1.1', 'Cookie: sid=a7f3c21e9b04'),
    later: pk('TLSv1.3', 'Application Data', '(encrypted)'),
    why: 'A session cookie read off the air logs the listener in as you. Over TLS it never shows.',
    rule: 'A session cookie seen in clear is a session stolen.',
  },
  {
    id: 'ftp-sftp',
    tier: 1,
    topic: 'Copying files to the server',
    first: pk('FTP', 'Request: PASS harbor2016', 'USER deploy / PASS harbor2016'),
    later: pk('SSH', 'Client: Encrypted packet (len=96)', '(encrypted)'),
    why: 'FTP sends the user and password as plain commands. SFTP runs inside SSH, so nothing is readable.',
    rule: 'FTP and Telnet are plain text: use SFTP and SSH.',
  },
  {
    id: 'telnet-ssh',
    tier: 1,
    topic: 'Logging in to a router',
    first: pk('TELNET', 'Telnet Data ...', 'login: admin / Password: Router!42'),
    later: pk('SSHv2', 'Server: Key Exchange Init', '(encrypted after key exchange)'),
    why: 'Telnet sends every keystroke as typed, password included. SSH encrypts from the key exchange on.',
    rule: 'Telnet on a network is a finding by itself.',
  },
  {
    id: 'basic-auth',
    tier: 1,
    topic: 'Calling the stock API',
    first: pk('HTTP', 'GET /api/stock HTTP/1.1', 'Authorization: Basic c3RvY2s6TGFtcDIw'),
    later: pk('TLSv1.3', 'Application Data', '(encrypted)'),
    why: 'Basic auth is only base64, not encryption: anyone can decode the user and password. Over TLS the header is hidden.',
    rule: 'Base64 is an encoding, not a lock.',
  },
  // ---- Tier 2: you need to know what still shows -------------------------------------
  {
    id: 'dns-plain',
    tier: 2,
    topic: 'Looking up a site',
    first: pk('DNS', 'Standard query A clinic-appointments.example', '(UDP: the name is readable)'),
    later: pk('TLSv1.3', 'Application Data to the resolver (DNS over HTTPS)', '(encrypted)'),
    why: 'Ordinary DNS shows every name you look up, even for HTTPS sites. DNS over HTTPS hides the question in TLS.',
    rule: 'HTTPS hides the page, not the lookup before it.',
  },
  {
    id: 'smtp-starttls',
    tier: 2,
    topic: 'Sending an invoice by email',
    first: pk('SMTP/IMF', 'from: billing@lantern.example, subject: Invoice 1042', 'the whole email, attachment included'),
    later: pk('SMTP', 'S: 220 2.0.0 Ready to start TLS', '(encrypted after STARTTLS)'),
    why: 'Mail servers still talk plain SMTP unless STARTTLS is used. Without it, the email crosses the network readable.',
    rule: 'Mail between servers needs STARTTLS.',
  },
  {
    id: 'snmp-v2',
    tier: 2,
    topic: 'Monitoring the printer',
    first: pk('SNMP', 'get-request 1.3.6.1.2.1.1.5.0', 'community: public'),
    later: pk('SNMP', 'encryptedPDU: privKey Unknown', '(SNMPv3, encrypted)'),
    why: 'SNMP v1 and v2c send the community string, which is the password, in clear. SNMPv3 can encrypt.',
    rule: 'SNMP v1/v2c: the password is in every packet.',
  },
  {
    id: 'redirect',
    tier: 2,
    topic: 'Typing shop.lantern.example',
    first: pk('HTTP', 'GET / HTTP/1.1 then 301 to https://', 'Cookie: sid=a7f3... sent before the redirect'),
    later: pk('TLSv1.3', 'Client Hello (SNI=shop.lantern.example)', '(HSTS: the browser went straight to HTTPS)'),
    why: 'Without HSTS the first request goes over HTTP, cookie and all, before the redirect. HSTS makes the browser skip it.',
    rule: 'A redirect to HTTPS still leaks the first request; HSTS does not.',
  },
  {
    id: 'secure-flag',
    tier: 2,
    topic: 'An old image link on the shop',
    first: pk('HTTP', 'GET /img/logo.png HTTP/1.1', 'Cookie: sid=a7f3c21e9b04'),
    later: pk('HTTP', 'GET /img/logo.png HTTP/1.1', '(no Cookie header)'),
    why: 'Without the Secure flag, the browser sends the session cookie even on a plain HTTP image request. With Secure it stays home.',
    rule: 'Mark session cookies Secure, so HTTP never carries them.',
  },
  // ---- Tier 3: one detail decides -------------------------------------------------------
  {
    id: 'sni',
    tier: 3,
    topic: 'Two HTTPS visits',
    first: pk('TLSv1.3', 'Client Hello (SNI=jobs-board.example)', '(encrypted)'),
    later: pk('TLSv1.3', 'Client Hello (Encrypted Client Hello)', '(encrypted)'),
    why: 'Both are encrypted, but the first names the site in clear in its SNI. Encrypted Client Hello hides even that.',
    rule: 'TLS hides what you did; the SNI still says where.',
  },
  {
    id: 'token-in-url',
    tier: 3,
    topic: 'A password reset link',
    first: pk('HTTP', 'GET /reset?token=9f2e1c HTTP/1.1', 'the token, in the URL, in clear'),
    later: pk('TLSv1.3', 'Application Data', '(encrypted, URL included)'),
    why: 'The token in the URL travels in clear over HTTP. Over HTTPS the URL path is encrypted too; only the name shows.',
    rule: 'Over HTTPS the path is secret; over HTTP nothing is.',
  },
  {
    id: 'size-timing',
    tier: 3,
    topic: 'Two encrypted uploads at 3 a.m.',
    first: pk('TLSv1.3', 'Application Data x 9,400 to 198.51.100.23', '(encrypted, 13 MB out)'),
    later: pk('TLSv1.3', 'Application Data x 12 to 203.0.113.80', '(encrypted, 9 KB)'),
    why: 'Neither is readable, but 13 MB leaving for an unknown address at night says a lot by itself. Volume and destination leak.',
    rule: 'Encryption hides content, not how much or where.',
  },
  {
    id: 'ftps',
    tier: 3,
    topic: 'An FTP login',
    first: pk('FTP', 'Request: AUTH TLS refused, then USER deploy', 'USER deploy / PASS harbor2016'),
    later: pk('FTP', 'Response: 234 AUTH TLS successful', '(encrypted after AUTH TLS)'),
    why: 'Both start as FTP, but only one upgrades to TLS before sending the password. The other falls back to plain text.',
    rule: 'Check that the upgrade to TLS really happened.',
  },
  {
    id: 'wpa',
    tier: 3,
    topic: 'Two café networks',
    first: pk('802.11', 'Open network, no password', 'every HTTP request readable by everyone on it'),
    later: pk('802.11', 'WPA3-Personal', 'readable only by the access point'),
    why: 'On an open network, anyone nearby can capture everything not encrypted by the site itself. WPA3 encrypts each device\'s link.',
    rule: 'Open Wi-Fi: assume everyone is listening.',
  },
  {
    id: 'set-cookie',
    tier: 3,
    topic: 'Logging in',
    first: pk('HTTP', 'HTTP/1.1 302 Found', 'Set-Cookie: staff=9c1e0b7a; Path=/'),
    later: pk('HTTP', 'HTTP/1.1 302 Found', 'Location: https://shop.lantern.example/login'),
    why: 'Both are plain HTTP redirects, but the first hands out a staff session in clear. The second only sends you to HTTPS.',
    rule: 'Read the headers, not just the status code.',
  },
];

export const SNIFF_BY_ID = Object.fromEntries(SNIFF_PAIRS.map((p) => [p.id, p])) as Record<string, SniffPair>;
