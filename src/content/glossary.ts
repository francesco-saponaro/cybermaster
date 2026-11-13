// Plain-word explanations for every technical word the game uses.
//
// The codex is the reward: longer entries you earn by clearing levels. The
// glossary is the safety net: any jargon in an instruction, a step or an
// arcade board can be explained on the spot, before the player has earned
// anything. Definitions assume no background at all and never lean on another
// technical word without explaining it in the same sentence.

export interface GlossEntry {
  id: string;
  /** How the word is shown in a list. */
  term: string;
  /** Exact spellings that count as this word in a text, case-sensitive. */
  match: string[];
  /** One or two sentences, no jargon. */
  plain: string;
  /** A short concrete example, when it helps. */
  example?: string;
  /** False for everyday words that would clutter a sentence if underlined; they still appear in word lists. */
  inline?: boolean;
}

export const GLOSSARY: GlossEntry[] = [
  // ---- The web, requests and responses ------------------------------------
  { id: 'http', term: 'HTTP', match: ['HTTP', 'http'], plain: 'The language a browser and a website use to talk. The browser sends a request ("give me this page"), and the website sends back a response.' },
  { id: 'https', term: 'HTTPS', match: ['HTTPS', 'https'], plain: 'HTTP sent through an encrypted connection, so nobody else on the same network can read or change it. It is what the padlock in the address bar means.' },
  { id: 'raw-request', term: 'Raw HTTP request', match: ['raw HTTP request', 'HTTP request', 'raw request'], plain: 'The exact text a browser sends to a website, line by line. Normally you never see it; here you can read and edit it before it goes.', example: 'GET /account HTTP/1.1' },
  { id: 'response', inline: false, term: 'Response', match: ['response', 'responses'], plain: "The website's answer to a request: a status code saying how it went, some header lines, then the page or data itself." },
  { id: 'get', term: 'GET', match: ['GET'], plain: 'A request that only asks to read something, like opening a page. It should never change anything on the server.', example: 'GET /products' },
  { id: 'post', term: 'POST', match: ['POST'], plain: 'A request that sends data to the server so it does something with it, like a login form or placing an order.', example: 'POST /login' },
  { id: 'delete', term: 'DELETE', match: ['DELETE'], plain: 'A request asking the server to remove something.' },
  { id: 'options', term: 'OPTIONS (preflight)', match: ['OPTIONS', 'preflight', 'Preflight'], plain: 'Before a page on one website calls another website in a risky way, the browser first asks "may I?" with an OPTIONS request. That question is called the preflight. If the answer is no, the real call is never sent.' },
  { id: 'path', inline: false, term: 'Path', match: ['path'], plain: 'The part of an address after the website name. In shop.example/account the path is /account.' },
  { id: 'header', term: 'Header', match: ['header', 'headers', 'Header'], plain: 'An extra line of information in a request or response, written as Name: value. Cookies, tokens and security rules all travel in headers.', example: 'Cookie: sid=7d1e' },
  { id: 'body', inline: false, term: 'Body', match: ['body'], plain: 'The main content of a request or response, after the header lines and one blank line. For a page it is the HTML; for a form it is what you typed.' },
  { id: 'status', inline: false, term: 'Status code', match: ['status code', 'status'], plain: 'A three-digit number at the top of every response saying how it went. 200 means fine, 401 means "who are you?", 403 means "not allowed", 404 means "not found", 500 means the server broke.' },
  { id: '200', term: '200 OK', match: ['200'], plain: 'The status code for "it worked, here you go".' },
  { id: '401', term: '401 Unauthorized', match: ['401'], plain: 'The status code for "I don\'t know who you are, or your proof of who you are is no good". You need to log in or send a valid token.' },
  { id: '403', term: '403 Forbidden', match: ['403'], plain: 'The status code for "I know who you are, but you are not allowed to do this".' },
  { id: '404', term: '404 Not Found', match: ['404'], plain: 'The status code for "there is nothing at that address".' },
  { id: 'api', term: 'API', match: ['API', 'APIs'], plain: 'A set of addresses a program (not a person) calls to get or change data. An app asks the API for your orders and gets back data instead of a web page.' },
  { id: 'api-version', term: 'v1 / v2', match: ['v1', 'v2'], plain: 'Version numbers in an API address. Companies keep the old version (v1) running while they move people to the new one (v2), and the old one often has bugs the new one fixed.' },
  { id: 'html', term: 'HTML', match: ['HTML'], plain: 'The text a web page is made of. The browser reads it and draws the page.' },
  { id: 'javascript', term: 'JavaScript / script', match: ['JavaScript', 'script', 'scripts'], plain: 'Code that runs inside a web page in your browser. A script on the page can read whatever the browser lets it read, which is why some things must be hidden from scripts.' },
  { id: 'console', term: 'Console', match: ['Console'], plain: 'A box where you can type JavaScript and run it on the current page, as a script on that page would. Developers use it to test things.' },
  { id: 'document-cookie', term: 'document.cookie', match: ['document.cookie'], plain: 'The piece of JavaScript that asks the browser "show me this page\'s cookies". If a cookie appears, any script on the page can read it.' },
  { id: 'json', term: 'JSON', match: ['JSON'], plain: 'A simple text format for data: names and values inside curly brackets, like {"role": "user"}. APIs and cloud policies are written in it.' },
  { id: 'url', term: 'URL', match: ['URL', 'URLs'], plain: 'A full web address, like https://shop.example/account.' },
  { id: 'localhost', term: 'localhost / 127.0.0.1', match: ['localhost', '127.0.0.1'], plain: 'Names that always mean "this same computer". Something listening only on localhost cannot be reached from any other machine.' },

  // ---- Cookies and sessions -----------------------------------------------
  { id: 'cookie', term: 'Cookie', match: ['cookie', 'cookies', 'Cookie'], plain: 'A small piece of text a website asks your browser to keep and send back with every request to that site. It is how a site remembers you between pages.', example: 'Cookie: sid=7d1e' },
  { id: 'set-cookie', term: 'Set-Cookie', match: ['Set-Cookie'], plain: 'The response header a server uses to hand your browser a cookie. Anything after the value, like HttpOnly, is a rule about how the browser should treat it.', example: 'Set-Cookie: session=e5d1; HttpOnly' },
  { id: 'session', term: 'Session', match: ['session', 'sessions'], plain: 'The server remembering that you logged in. It gives you a random code (the session id) and, as long as you send that code back, treats you as logged in.' },
  { id: 'sid', term: 'Session id (sid)', match: ['session id', 'sid', 'session ids'], plain: 'The random code that proves you are logged in. Whoever has it is you as far as the server knows, so it must stay secret.', example: 'sid=7d1e…' },
  { id: 'httponly', term: 'HttpOnly', match: ['HttpOnly'], plain: 'A rule added to a cookie that says "scripts on the page may not read this". The browser still sends it to the server, so the user notices nothing.' },
  { id: 'secure-flag', term: 'Secure', match: ['Secure'], plain: 'A rule added to a cookie that says "only send this over HTTPS", so it never travels unencrypted.' },
  { id: 'samesite', term: 'SameSite', match: ['SameSite', 'SameSite=Lax', 'Lax'], plain: 'A rule added to a cookie that says "do not send this when another website triggers the request". Lax still allows ordinary links from other sites.' },
  { id: 'role-cookie', term: 'Role in a cookie', match: ['role=user', 'role=admin'], plain: 'Keeping "user" or "admin" in a plain cookie means the browser holds it, and the person at the browser can simply edit it. The server should look your role up itself.' },
  { id: 'robots', term: 'robots.txt', match: ['robots.txt'], plain: 'A public file that asks search engines not to list some pages. It hides nothing: anyone can read it, and it often points straight at the pages a site would rather keep quiet.' },
  { id: 'forced-browsing', term: 'Forced browsing', match: ['forced browsing', 'Forced browsing'], plain: 'Opening a page just by typing its address, even though no link points to it. If the page does not check who you are, you get in.' },
  { id: 'hijack', term: 'Session hijacking', match: ['session hijacking', 'hijacking'], plain: "Stealing someone's session id and using it, which logs you in as them without their password." },
  { id: 'replay', term: 'Replay', match: ['replay', 'replayed'], plain: 'Sending a copied request again, unchanged. If it still works, whoever copied it can act as the original sender.' },
  { id: 'open-wifi', term: 'Open Wi-Fi', match: ['open Wi-Fi', 'Wi-Fi'], plain: 'A network with no password, like in a café. On plain HTTP, other people on it can read what you send, cookies included.' },

  // ---- Proxy and tools ------------------------------------------------------
  { id: 'proxy', term: 'Proxy', match: ['proxy', 'Proxy'], plain: 'A tool that sits between your browser and the website and lets you pause, read and change messages as they pass. Security testers use one to see exactly what is sent.' },
  { id: 'proxy-history', term: 'Proxy history', match: ['Proxy history'], plain: 'The list of requests the proxy has seen go past, so you can load one and look at it or send it again.' },

  // ---- Tokens ---------------------------------------------------------------
  { id: 'token', term: 'Token', match: ['token', 'tokens'], plain: 'A piece of text that proves who you are, sent with each request instead of a cookie. Usually it is signed, so nobody can change it without being noticed.' },
  { id: 'jwt', term: 'JWT', match: ['JWT', 'JWTs'], plain: 'A common kind of token made of three parts joined by dots: a header (how it is signed), a payload (who you are, your role, when it expires) and a signature (the proof nobody changed the first two).' },
  { id: 'authorization', term: 'Authorization header', match: ['Authorization'], plain: 'The request header that carries a token.', example: 'Authorization: Bearer eyJhbGci…' },
  { id: 'payload', term: 'Payload', match: ['payload', 'Payload'], plain: "The middle part of a JWT: the facts the token claims, like who you are and your role. Anyone can read it; the signature is what stops people changing it." },
  { id: 'signature', term: 'Signature', match: ['signature', 'Signature', 'unsigned'], plain: 'A short code made from the token and a secret key only the server knows. If anyone changes the token, the signature no longer matches and the server knows it was tampered with.' },
  { id: 'alg', term: 'alg', match: ['alg'], plain: "A field in a JWT's header naming how the token was signed. A server should decide this itself and ignore whatever the token claims.", example: '"alg": "HS256"' },
  { id: 'hs256', term: 'HS256', match: ['HS256'], plain: 'A signing method: the server mixes the token with its own secret key to make the signature. Without the key you cannot make a valid one.' },
  { id: 'alg-none', term: 'alg: none', match: ['alg: none', 'alg none', '"none"'], plain: 'A token that says "I have no signature, don\'t check me". A server that believes it accepts tokens anyone can write.' },
  { id: 'typ', term: 'typ', match: ['typ'], plain: 'A field in a JWT\'s header that just says "this is a JWT". Harmless.' },
  { id: 'exp', term: 'exp (expiry)', match: ['exp'], plain: 'The time a token stops being valid. After that the server must refuse it, even if the signature is fine.' },
  { id: 'claims', term: 'sub, role, iat', match: ['sub', 'iat'], plain: 'Fields in a JWT payload: sub is who the token is for, role is what they may do, iat is when it was issued.' },

  // ---- Websites calling each other ------------------------------------------
  { id: 'origin', term: 'Origin', match: ['Origin', 'origin'], plain: 'The website a request comes from, which the browser adds as a header. If a payment request says Origin: evil.example, a page on another website made it, not your shop.', example: 'Origin: evil.example' },
  { id: 'cors', term: 'CORS', match: ['CORS'], plain: "The browser rule that stops a page on one website reading another website's answers, unless that website says it is allowed. A wrongly open setting lets any site read your data." },
  { id: 'acao', term: 'Access-Control-Allow-Origin', match: ['Access-Control-Allow-Origin', 'Allow-Origin'], plain: 'The response header that tells the browser which other website may read this answer. It should name one trusted site, never echo back whoever asks.' },
  { id: 'hsts', term: 'HSTS (Strict-Transport-Security)', match: ['HSTS', 'Strict-Transport-Security'], plain: 'A response header that tells the browser "only ever use HTTPS for this site from now on", so nobody can quietly drop you to plain HTTP. max-age is how long, in seconds.' },
  { id: 'security-headers', term: 'Security headers', match: ['security headers'], plain: 'Response headers whose only job is to make the browser stricter, like HSTS or HttpOnly on cookies.' },

  // ---- Web attacks and fixes (The Arena) -------------------------------------
  { id: 'sql', term: 'SQL', match: ['SQL'], plain: 'The language programs use to ask a database for data, like "find the user with this name and password".' },
  { id: 'query', term: 'Query', match: ['query', 'queries'], plain: 'One question sent to a database in SQL.' },
  { id: 'sqli', term: 'SQL injection', match: ['SQL injection', 'SQLi'], plain: "When text a user typed is pasted straight into a database query, a quote mark can end the text early and the rest is read as part of the query. The attacker ends up writing the database's instructions." },
  { id: 'param-query', term: 'Parameterised query', match: ['parameterised query', 'parameterised queries', 'prepared statement', 'prepared statements', 'placeholder', 'placeholders'], plain: 'Writing the query with blanks (placeholders) and handing the user\'s text over separately, so the database always treats it as plain data and never as instructions. The real fix for SQL injection.' },
  { id: 'xss', term: 'XSS (cross-site scripting)', match: ['XSS', 'cross-site scripting'], plain: "When text a user typed ends up on a page as working code, so the attacker's script runs in other people's browsers and can act as them." },
  { id: 'escape', term: 'Escaping / encoding', match: ['escape', 'escaped', 'escaping', 'encode', 'encoded', 'encoding'], plain: "Turning characters like < and > into harmless look-alikes before putting user text on a page, so the browser shows them instead of running them." },
  { id: 'idor', term: 'IDOR / BOLA', match: ['IDOR', 'BOLA'], plain: "When changing a number in an address (order 7001 to 7002) shows someone else's data because the server never checks it belongs to you. Both names mean the same mistake." },
  { id: 'owner-check', term: 'Owner check', match: ['ownerCheck', 'owner check'], plain: 'The server checking "does this record belong to the person asking?" before handing it over. Missing it causes IDOR.' },
  { id: 'cmdi', term: 'Command injection', match: ['command injection', 'OS command'], plain: "When user text is pasted into a command the server runs on its own system, so extra characters let the attacker run commands of their own." },
  { id: 'ssrf', term: 'SSRF', match: ['SSRF', 'server-side request forgery'], plain: 'When you can make the server fetch an address of your choosing, so it reaches into its own private network for you.' },
  { id: 'mass-assign', term: 'Mass assignment', match: ['mass assignment', 'Mass assignment'], plain: 'When a sign-up or profile form saves every field it receives, so adding "role": "admin" to the request makes you an admin. The fix is to accept only the fields you expect.' },
  { id: 'rate-limit', term: 'Rate limit', match: ['rate limit', 'rateLimit', 'rate limiting'], plain: 'A cap on how many tries someone gets in a time window, like 5 logins a minute, so nobody can guess passwords at full speed.' },
  { id: 'waf', term: 'WAF', match: ['WAF'], plain: 'A web application firewall: a filter in front of a website that blocks requests that look like known attacks. It helps, but it can be dodged, so it never replaces fixing the code.' },
  { id: 'brute-force', term: 'Brute force', match: ['brute force', 'brute-force'], plain: 'Trying passwords one after another, very fast, until one works.' },
  { id: 'scanner', term: 'Scanner', match: ['scanner', 'scanners', 'Scanner'], plain: 'A tool that tests a website or network automatically and lists possible problems. Its list is a starting point; a person still has to check each one.' },
  { id: 'zap', term: 'ZAP', match: ['ZAP'], plain: 'A free, widely used scanner for websites.' },
  { id: 'false-positive', term: 'False positive', match: ['false positive', 'false-positive', 'false alarm'], plain: 'Something a tool reports as a problem that turns out not to be one.' },
  { id: 'code-scan', term: 'Code scan', match: ['code scan', 'static analysis'], plain: 'A tool that reads the source code, without running it, and flags lines that look dangerous.' },

  // ---- Networks (The Perimeter) ----------------------------------------------
  { id: 'ip', term: 'IP address', match: ['IP address', 'IP addresses', 'IP'], plain: 'The number that identifies a machine on a network, like 10.0.8.21. It works like a street address for computers.' },
  { id: 'cidr', term: 'Address range (/24, /27)', match: ['/24', '/27', 'CIDR'], plain: 'A short way to write a block of addresses. 10.0.8.0/24 means the 256 addresses from 10.0.8.0 to 10.0.8.255; a bigger number after the slash means a smaller block.' },
  { id: 'any-address', term: '0.0.0.0/0', match: ['0.0.0.0/0'], plain: 'Every address on the internet. A firewall rule open to 0.0.0.0/0 lets the whole world in.' },
  { id: 'port', term: 'Port', match: ['port', 'ports', 'Port', 'Ports'], plain: 'A numbered door on a machine, one per service. Web sites usually listen on 80 and 443, SSH on 22, databases on 5432. An open port is a door something answers at.' },
  { id: 'tcp', term: 'TCP', match: ['TCP', 'tcp'], plain: 'The common way two machines open a reliable connection. "5432/tcp open" means something answers on door 5432.' },
  { id: 'service', inline: false, term: 'Service', match: ['service', 'services'], plain: 'A program on a machine that answers on a port, like a web server or a database.' },
  { id: 'banner', term: 'Banner', match: ['banner', 'banners'], plain: 'The first line a service sends when you connect, which often states its name and exact version. More reliable than a scanner\'s guess.' },
  { id: 'version', inline: false, term: 'Version', match: ['version', 'versions'], plain: 'The exact release of a program, like vsftpd 2.3.4. Known weaknesses are tied to particular versions, so the version decides whether a host is at risk.' },
  { id: 'host', inline: false, term: 'Host', match: ['host', 'hosts'], plain: 'One machine on a network.' },
  { id: 'recon', term: 'Recon (reconnaissance)', match: ['recon', 'Reconnaissance', 'reconnaissance'], plain: 'The first phase of a test: finding out what exists (which machines, which doors, which programs) before trying anything.' },
  { id: 'nmap', term: 'nmap', match: ['nmap', 'Nmap'], plain: 'The standard tool for mapping a network: which machines are up and which ports they have open.' },
  { id: 'nmap-sn', term: 'nmap -sn', match: ['-sn'], plain: 'nmap\'s "who is there?" sweep: it only checks which machines answer, without looking at their ports.' },
  { id: 'nmap-sv', term: 'nmap -sV', match: ['-sV', 'sV'], plain: 'nmap asking each open port which program and version is behind it.' },
  { id: 'nmap-p', term: '-p', match: ['-p'], plain: 'The nmap option that picks which ports to check, like -p 21.' },
  { id: 'cve', term: 'CVE', match: ['CVE', 'CVEs'], plain: 'The public ID number of a known security flaw in a specific program version, like CVE-2011-2523. If a version has a CVE, the weakness is documented and often easy to use.' },
  { id: 'vulndb', term: 'vulndb', match: ['vulndb'], plain: 'The game\'s lookup of known flaws: give it a program and version and it lists the CVEs that apply.' },
  { id: 'ftp', term: 'FTP', match: ['FTP', 'vsftpd', 'ProFTPD'], plain: 'An old way to move files between machines, with no encryption. vsftpd and ProFTPD are two FTP programs, and some of their old versions have famous holes.' },
  { id: 'ssh', term: 'SSH', match: ['SSH'], plain: 'The encrypted way administrators log in to a server remotely, normally on port 22. It should only be reachable from trusted addresses.' },
  { id: 'rdp', term: 'RDP', match: ['RDP'], plain: 'Windows remote desktop, on port 3389. Left open to the internet, it is one of the most attacked doors there is.' },
  { id: 'postgres', term: 'PostgreSQL', match: ['PostgreSQL', 'Postgres'], plain: 'A popular database, on port 5432. A database should never be reachable from the internet directly.' },
  { id: 'apache', term: 'Apache / nginx', match: ['Apache', 'nginx'], plain: 'Two common web server programs, the software that answers web requests.' },
  { id: 'nc', term: 'nc (netcat)', match: ['nc'], plain: 'A tiny tool that opens a raw connection to a port, so you can read the banner the service sends.' },
  { id: 'curl', term: 'curl', match: ['curl', 'curl -I'], plain: 'A command-line tool that sends web requests. curl -I asks for the response headers only.' },
  { id: 'dns', term: 'DNS / dig', match: ['DNS', 'dig'], plain: 'DNS is the internet\'s phone book: it turns a name like shop.example into an IP address. dig is the tool that asks it.' },
  { id: 'whois', term: 'whois / OrgName', match: ['whois', 'OrgName'], plain: 'A lookup that says who owns an IP address or domain. OrgName is the owning organisation, which tells you whether an address really belongs to your client.' },
  { id: 'scope', term: 'Scope', match: ['scope', 'in-scope', 'out-of-scope', 'Scope', 'scope.txt'], plain: 'The list of machines and addresses the client has said in writing you may test. Touching anything outside it is not allowed, even by accident.' },
  { id: 'terminal', term: 'Terminal', match: ['Terminal', 'terminal'], plain: 'A window where you type commands instead of clicking.' },
  { id: 'cat', term: 'cat', match: ['cat'], plain: 'The command that prints a file to the screen.' },

  { id: 'ping', term: 'Ping sweep', match: ['ping', 'Ping', 'Ping sweep', 'ping sweep'], plain: 'Ping sends a tiny "are you there?" message to a machine. A ping sweep does it to a whole block of addresses to see which machines answer; it tells you nothing about what runs on them.' },
  { id: 'port-scan', term: 'Port scan', match: ['port scan', 'Port scan'], plain: 'Checking which numbered doors (ports) on a machine have something answering behind them.' },
  { id: 'allow-list', term: 'Allow-list', match: ['allow-list', 'allow-lists', 'Allow-list'], plain: 'A fixed list of the only things permitted, like the only websites a server may fetch or the only form fields it will save. Everything not on it is refused.' },
  { id: 'shell', term: 'Shell / execFile', match: ['shell', 'execFile', 'exec'], plain: 'A shell is the program that reads typed commands, where characters like ; and | start extra commands. execFile runs one program directly with a list of arguments, so no shell ever reads the input.' },
  { id: 'ci', term: 'CI', match: ['CI'], plain: 'Continuous integration: the robot that builds, tests and deploys the code every time someone changes it. It needs its own permissions, and only the ones it uses.' },
  { id: 'foothold', term: 'Foothold', match: ['foothold', 'broken into'], plain: 'An attacker who has already got onto one machine, like the web shop. Good permissions make sure that machine leads nowhere else.' },
  // ---- OpenVAS (The Scanner) ---------------------------------------------------
  { id: 'openvas', term: 'OpenVAS / Greenbone', match: ['OpenVAS', 'Greenbone', 'GVM'], plain: 'OpenVAS is a free vulnerability scanner made by the company Greenbone. It runs thousands of small tests against your machines and lists what it finds; the whole system around it (database, web console) is called GVM.' },
  { id: 'vt', term: 'VT (vulnerability test)', match: ['VT', 'VTs', 'vulnerability test', 'vulnerability tests'], plain: 'One small check in the scanner, usually for one flaw: "is this OpenSSH version affected by regreSSHion?". Older documents call them NVTs.' },
  { id: 'feed', term: 'Feed', match: ['feed', 'Feed'], plain: "The scanner's collection of vulnerability tests, updated daily by Greenbone. A scanner only finds flaws its feed already has a test for." },
  { id: 'gvm-target', term: 'Target', match: ['target', 'targets', 'Target'], plain: 'What a scan or test is pointed at. In OpenVAS, a target lists the addresses to scan, the ones to leave out, which ports to try and how to decide a machine is there.' },
  { id: 'gvm-task', term: 'Task', match: ['task', 'tasks', 'Task'], plain: 'A job to run. In OpenVAS, a task is a target plus a scan config, and every time you start it, it produces a new report.' },
  { id: 'scan-config', term: 'Scan config', match: ['scan config', 'Scan config', 'Full and fast', 'Discovery'], plain: 'Which tests a scan runs. Full and fast runs every test that matches what it finds and skips the ones that could crash a service; Discovery only lists hosts, ports and products.' },
  { id: 'port-list', term: 'Port list', match: ['port list', 'Port list', 'IANA'], plain: 'Which ports the scan tries on each machine. A short list is faster and blind to everything outside it.' },
  { id: 'alive-test', term: 'Alive test', match: ['alive test', 'Alive test', 'Consider Alive', 'ICMP Ping'], plain: 'How the scanner decides a machine is there before scanning it. ICMP Ping skips anything that ignores pings; Consider Alive scans every address anyway.' },
  { id: 'gvm-qod-word', term: 'QoD (quality of detection)', match: ['QoD'], plain: 'How sure the scanner is that a result is real, from 1% to 100%. 97% means it logged in and checked the installed package; 30% means it only read a version number that may not tell the truth.' },
  { id: 'gvm-override-word', term: 'Override', match: ['override', 'overrides', 'Override'], plain: 'A note that changes how a result shows in every report, for example to False Positive, along with the reason. Next week\'s scan keeps it.' },
  { id: 'credential', term: 'Credential / authenticated scan', match: ['credential', 'credentials', 'Credential', 'Credentials', 'authenticated scan', 'logged-in scan'], plain: 'A username and key the scanner uses to log in to each machine. Logged in, it reads exactly what is installed instead of guessing from outside.' },
  { id: 'delta', term: 'Delta report', match: ['delta report', 'delta', 'Compare with last week'], plain: 'Two reports of the same scan compared: what was fixed, what is new and what is still open.' },
  { id: 'schedule', term: 'Schedule', match: ['schedule', 'Schedule', 'weekly', 'Every Monday, 06:00'], plain: 'When a task runs by itself, like every Monday at six, so scanning becomes a habit instead of a one-off.' },
  { id: 'log-result', term: 'Log result', match: ['Log'], plain: 'A result with severity 0: information the scanner recorded, like the operating system or an open port. Not a problem to fix.' },
  { id: 'eol', term: 'End of life (EOL)', match: ['end of life', 'end-of-life', 'EOL'], plain: 'A product version that no longer gets security updates from its maker. Every new flaw found in it stays open forever.' },
  { id: 'telnet-word', term: 'Telnet', match: ['Telnet', 'telnet'], plain: 'An old way to log in to a machine remotely that sends everything, passwords included, as readable text. SSH replaced it.' },
  { id: 'samba', term: 'Samba / SMB', match: ['Samba', 'SMB', 'NAS'], plain: 'Samba lets a Linux machine share folders with Windows computers (the SMB protocol, port 445). A NAS is a box on the network that stores shared files, often running Samba.' },
  { id: 'tls', term: 'TLS', match: ['TLS', 'TLSv1.0', 'TLS 1.0'], plain: 'The encryption behind HTTPS. Versions 1.0 and 1.1 are retired; 1.2 and 1.3 are the ones to keep.' },
  { id: 'backport', term: 'Backport', match: ['backported', 'backport', 'backports'], plain: 'When a Linux distribution copies a security fix into its own older version of a program instead of upgrading it. The version number stays the same, so a scanner reading it is fooled.' },
  { id: 'package', term: 'Package', match: ['package', 'packages'], plain: 'A piece of installed software on Linux, with an exact version. Comparing it with the fixed version is the surest way to know a flaw is there.' },
  { id: 'privesc', term: 'Privilege escalation (root)', match: ['root', 'privilege escalation'], plain: 'Turning a normal account into the all-powerful one (root on Linux). Flaws like PwnKit and Baron Samedit do exactly that.' },

  { id: 'kev-word', term: 'KEV catalog', match: ['KEV', 'Known Exploited Vulnerabilities', 'KEV catalog'], plain: "A free list kept by CISA of vulnerabilities attackers are really using. If a CVE from your scan is in it, fix that one first." },
  { id: 'cisa', term: 'CISA', match: ['CISA'], plain: 'The Cybersecurity and Infrastructure Security Agency, the United States government agency for cyber security. It publishes the KEV catalog.' },
  { id: 'in-the-wild', term: 'Exploited in the wild', match: ['in the wild', 'exploited', 'Exploited'], plain: 'Used by real attackers against real systems, as opposed to only shown possible by researchers.' },
  { id: 'poc', term: 'Proof of concept', match: ['proof of concept', 'proof-of-concept', 'PoC'], plain: 'Code that shows a flaw can be used, written by researchers. It makes attacks easier but is not evidence that anyone has attacked yet.' },
  { id: 'bod', term: 'BOD 22-01', match: ['BOD 22-01', 'Binding Operational Directive 22-01'], plain: 'The CISA order that makes US federal agencies fix every KEV entry by its due date. Other organisations are not bound by it but are urged to follow it.' },
  // ---- Cloud (The Cloud) -----------------------------------------------------
  { id: 'cloud', term: 'Cloud account', match: ['cloud account', 'AWS'], plain: "Servers, storage and databases rented from a provider like AWS, set up and controlled through settings rather than physical machines." },
  { id: 'bucket', term: 'Bucket (S3)', match: ['bucket', 'buckets', 'Bucket', 'S3', 's3'], plain: 'A folder of files stored in the cloud. S3 is the AWS service for them. A bucket open to the public can be read by anyone who finds its address.' },
  { id: 'policy', term: 'Policy', match: ['policy', 'policies', 'Policy'], plain: 'A short JSON document listing who may do what to which thing. Every cloud permission comes down to one.' },
  { id: 'principal', term: 'Principal', match: ['Principal', '"Principal": "*"'], plain: 'The "who" in a policy. "*" means everyone, including people on the internet with no account.' },
  { id: 'action', term: 'Action', match: ['Action', '"Action": "*"'], plain: 'The "what" in a policy, like s3:GetObject (read a file) or s3:PutObject (write a file). "*" means every action, including deleting.' },
  { id: 'getobject', term: 's3:GetObject / s3:PutObject', match: ['s3:GetObject', 's3:PutObject', 'GetObject', 'PutObject'], plain: 'The two everyday bucket actions: GetObject reads a file, PutObject writes one.' },
  { id: 'arn', term: 'ARN', match: ['ARN', 'arn'], plain: "AWS's full name for a resource, like arn:aws:s3:::harbor-reports/monthly/*. In a policy it is the \"which thing\", and the * at the end means everything under that folder." },
  { id: 'iam', term: 'IAM / role', match: ['IAM', 'IAM role', 'IAM roles'], plain: "IAM is where a cloud account says who may do what. An IAM role is a named set of permissions that a person or a server can use." },
  { id: 'least-privilege', term: 'Least privilege', match: ['least privilege', 'Least privilege'], plain: 'Giving each person or program only the permissions its job needs and nothing more, so a mistake or a break-in reaches as little as possible.' },
  { id: 'public-access', term: 'Block all public access', match: ['Block all public access'], plain: 'An account-wide switch that stops any bucket being made public, even if a policy says otherwise.' },
  { id: 'firewall', term: 'Firewall / security group', match: ['firewall', 'Firewall', 'security group', 'security groups'], plain: 'A list of rules saying which addresses may reach which ports on a server. Anything not allowed is dropped.' },
  { id: 'inbound', term: 'Inbound rule', match: ['inbound', 'Inbound'], plain: 'A firewall rule for traffic coming in from outside to the server.' },
  { id: 'access-key', term: 'Access key', match: ['access key', 'access keys', 'AWS_ACCESS_KEY_ID'], plain: 'A password for programs: a key id and a secret that let a script act on the cloud account. If one leaks, whoever has it can act as you until the key is switched off.' },
  { id: 'rotate', term: 'Rotate / deactivate a key', match: ['rotate', 'rotation', 'Deactivate', 'deactivate'], plain: 'Making a new key, moving every program to it, then switching the old one off. Deleting the leaked line from the code is not enough: the old key still works until you deactivate it.' },
  { id: 'commit', term: 'Commit', match: ['commit', 'commits'], plain: 'One saved change in a code history. Old commits stay readable forever, so a secret saved once is still there after you delete it.' },
  { id: 'pipeline', term: 'Pipeline secret', match: ['pipeline', 'Pipeline secret', 'pipeline secret'], plain: 'A secret stored in the build system\'s settings instead of in the code, so programs can use it without anyone writing it down.' },
  { id: 'gateway', term: 'API gateway', match: ['Gateway', 'gateway'], plain: 'The front door in front of all of an API\'s routes, where login, owner checks and rate limits can be set per route.' },
  { id: 'auth-none', term: '"auth": "none"', match: ['"auth": "none"', 'Anonymous'], plain: 'A route setting that means "no login needed". Fine for a public page, a leak on anything private.' },
  { id: 'service-token', term: 'Service token', match: ['service-token', 'Service token'], plain: 'A login meant for other programs, not people, so only trusted internal services can call that route.' },

  // ---- Containers and the lab ------------------------------------------------
  { id: 'docker', term: 'Docker / container', match: ['Docker', 'docker', 'container', 'containers', 'Containers'], plain: 'A container is a program packed with everything it needs so it runs the same on any machine. Docker is the tool that runs them.' },
  { id: 'compose', term: 'Docker Compose', match: ['compose', 'docker-compose', 'Compose'], plain: 'A file that lists several containers and how they connect, so one command starts them all together.' },
  { id: 'image', inline: false, term: 'Image', match: ['image'], plain: 'The packaged program a container starts from, named like bkimminich/juice-shop.' },
  { id: 'port-binding', term: 'Port binding (3000:3000)', match: ['3000:3000', '127.0.0.1:3000:3000', 'Binding', 'bind'], plain: 'Connecting a port on your computer to a port inside a container. 3000:3000 opens it to your whole network; 127.0.0.1:3000:3000 keeps it on your own machine.' },
  { id: 'network', term: 'Network (in Compose)', match: ['networks'], plain: 'A private link between containers. Only containers on the same network can reach each other by name.' },
  { id: 'juice-shop', term: 'Juice Shop', match: ['Juice Shop', 'juice-shop'], plain: 'A deliberately broken practice web shop, made for learning web security safely.' },

  // ---- Reporting (The Report) ------------------------------------------------
  { id: 'finding', inline: false, term: 'Finding', match: ['finding', 'findings', 'Finding'], plain: 'One confirmed security problem written up in a report: what it is, where, how bad, the proof, and how to fix it.' },
  { id: 'asset', inline: false, term: 'Asset', match: ['asset', 'Asset', 'assets'], plain: 'The exact thing that has the problem, like one address or one page.' },
  { id: 'impact', inline: false, term: 'Impact', match: ['impact', 'Impact'], plain: 'What an attacker could actually do with the problem, in words the business understands.' },
  { id: 'evidence', inline: false, term: 'Evidence', match: ['evidence', 'Evidence'], plain: 'The proof: the request and response, a log line or a screenshot that shows the problem is real.' },
  { id: 'remediation', term: 'Remediation / fix', match: ['remediation', 'Remediation'], plain: 'The change that removes the problem, written so a developer can act on it.' },
  { id: 'retest', term: 'Retest', match: ['retest', 'Retest', 'retesting', 'Retesting'], plain: 'Trying the original attack again after the fix, to prove it no longer works.' },
  { id: 'validation', term: 'Validation', match: ['Validation', 'validation', 'validate', 'validated'], plain: 'Proving a reported problem is real, carefully and without causing damage, before calling it a finding.' },
  { id: 'cvss', term: 'CVSS', match: ['CVSS'], plain: 'A standard way to score how severe a flaw is, from 0 to 10, by answering eight questions about it: how it is reached, how hard it is, what it exposes.' },
  { id: 'cvss-av', term: 'Attack Vector (AV)', match: ['AV', 'Attack Vector'], plain: 'Where the attacker has to be: anywhere on the internet (Network), on the same network (Adjacent), on the machine (Local) or physically there.' },
  { id: 'cvss-ac', term: 'Attack Complexity (AC)', match: ['AC', 'Attack Complexity'], plain: 'Whether it works every time (Low) or needs special conditions to line up (High).' },
  { id: 'cvss-pr', term: 'Privileges Required (PR)', match: ['PR', 'Privileges Required', 'Privileges'], plain: 'Whether the attacker needs an account first: None, a normal user (Low) or an admin (High).' },
  { id: 'cvss-ui', term: 'User Interaction (UI)', match: ['UI', 'User Interaction'], plain: 'Whether a victim has to do something, like click a link, for it to work.' },
  { id: 'cvss-s', term: 'Scope (CVSS)', match: ['Unchanged', 'Changed'], plain: 'Whether the damage stays inside the broken program (Unchanged) or spreads to other systems (Changed).' },
  { id: 'cia', term: 'Confidentiality, Integrity, Availability', match: ['Confidentiality', 'Integrity', 'Availability'], plain: 'The three things a flaw can hurt: secrets being read (confidentiality), data being changed (integrity), or the service going down (availability).' },
  { id: 'severity', inline: false, term: 'Severity', match: ['severity', 'Severity', 'Critical', 'High', 'Medium', 'Low'], plain: 'How urgent a finding is: Critical, High, Medium or Low, usually taken from its CVSS score.' },
];

export const GLOSS_BY_ID: Record<string, GlossEntry> = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Every spelling, longest first, mapped to its entry. */
const SPELLINGS: [string, GlossEntry][] = GLOSSARY.flatMap((g) => g.match.map((m) => [m, g] as [string, GlossEntry])).sort((a, b) => b[0].length - a[0].length);
const BY_SPELLING = new Map(SPELLINGS);

/** Matches any spelling as a whole word: not glued to letters, digits, dashes or dots that continue a word. */
export const GLOSS_RE = new RegExp(`(?<![\\w-])(${SPELLINGS.map(([m]) => escapeRe(m)).join('|')})(?![\\w-]|\\.\\w)`, 'g');

export function glossFor(spelling: string): GlossEntry | undefined {
  return BY_SPELLING.get(spelling);
}

/** The entries a set of texts mentions, in the order they first appear. Term and code markup are read as plain words. */
export function termsIn(texts: string[]): GlossEntry[] {
  const seen = new Set<string>();
  const out: GlossEntry[] = [];
  for (const raw of texts) {
    const text = raw.replace(/\[\[[\w-]+\|([^\]]+)\]\]/g, '$1').replace(/`([^`]+)`/g, ' $1 ');
    for (const m of text.matchAll(GLOSS_RE)) {
      const g = BY_SPELLING.get(m[1]!);
      if (g && !seen.has(g.id)) {
        seen.add(g.id);
        out.push(g);
      }
    }
  }
  return out;
}
