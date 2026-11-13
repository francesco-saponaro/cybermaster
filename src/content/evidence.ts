import type { Evidence } from './types';

// What the player collects while clearing levels, kept in the save. The Report
// zone builds its finding from these; anything not yet collected comes from the
// case file instead, so the zone can be played in any order.

export const EVIDENCE: Evidence[] = [
  {
    id: 'ev-cafe-pcap',
    from: 'pcap-stream',
    title: "Café Wi-Fi capture: Mara's session cookie, used from a second laptop",
    body: "22:40:12  10.20.0.14 -> shop.lantern.example  GET /account  Cookie: sid=a7f3c21e9b04 (plain HTTP)\n22:40:55  10.20.0.37 -> shop.lantern.example  GET /account/orders  Cookie: sid=a7f3c21e9b04  User-Agent: curl/8.5.0",
  },
  {
    id: 'ev-sqli-request',
    from: 'arena-sqli',
    title: 'Login bypass: the request and the response',
    body: "POST https://shop.lantern.example/login\nname: input containing a quote that ends the string, then a comment\npass: anything\n\nHTTP/1.1 200 OK\nWelcome, admin (admin)",
  },
  {
    id: 'ev-sqli-log',
    from: 'arena-sqli',
    title: 'Server log: the query the database ran',
    body: "SQL  SELECT * FROM users WHERE name = '[hostile input]' AND pass = 'anything'\nthe input ended the string: the password check no longer applied",
  },
  {
    id: 'ev-scanner-sqli',
    from: null,
    title: 'Scanner alert on /login',
    body: '[Medium] SQL Injection (confidence: tentative)\nURL: https://shop.lantern.example/login  parameter: name',
  },
  {
    id: 'ev-idor',
    from: 'arena-idor',
    title: "Sam opens Mara's invoice",
    body: 'GET /api/invoices/1042 (signed in as sam, u-23)\n\nHTTP/1.1 200 OK\n{"id":1042,"ownerId":"u-17","customer":"Mara Okafor","total":"420.00 EUR"}',
  },
  {
    id: 'ev-jwt-none',
    from: 'wire-jwt',
    title: 'Admin API accepts an unsigned token',
    body: 'GET /v1/admin\nAuthorization: Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJzYW0iLCJyb2xlIjoiYWRtaW4ifQ.\n\nHTTP/1.1 200 OK\n{"admin":true,"user":"sam"}',
  },
  {
    id: 'ev-vsftpd',
    from: 'perimeter-versions',
    title: 'vsftpd 2.3.4 on files.harbor.lan',
    body: '21/tcp open  ftp  vsftpd 2.3.4\nCVE-2011-2523  9.8  backdoor command execution',
  },
  {
    id: 'ev-bucket',
    from: 'cloud-bucket',
    title: 'Invoices bucket readable by anyone',
    body: 'GET https://harbor-invoices.s3.amazonaws.com/2026/INV-1043.pdf (no credentials)\n\nHTTP/1.1 200 OK\nContent-Type: application/pdf',
  },
];

export const EVIDENCE_BY_ID = Object.fromEntries(EVIDENCE.map((e) => [e.id, e])) as Record<string, Evidence>;
