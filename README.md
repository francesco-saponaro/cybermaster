# CyberMaster

A browser game that teaches cybersecurity by having you do the work in small sandboxes. You work out where a network ends, lock down a Linux server, read a café's Wi-Fi in a packet capture, edit a raw HTTP request and watch the page change, find the line of server code that let an attack through and fix it, sweep a network from a terminal, close a public bucket, and write the finding a client will read.

I built it because I learn a subject fastest when I can poke at it and see what happens. The first version was a set of quizzes with a game skin, and it assumed you already knew the answers. This version works the other way round. Each level gives you one new idea, a two-sentence note in the corner, a short list of steps and a sandbox. You act, and the sandbox reacts straight away. A level is cleared when every step is done, which depends on the state of the sandbox, not on picking an answer.

That made it interactive, but not much fun: the steps left nothing to figure out, nothing was at stake and nothing tied the levels together. So the steps are now only the first round. After that each level has a challenge with new values and no steps, the bosses fight back on a timer, and the levels add up to one case you solve. Beating a zone's boss also opens a short arcade game built on what that zone taught.

## How a level plays

- **A goal and a short note.** Ines, your lead, says in at most two sentences what the level is about and where to start.
- **Numbered steps.** Every level, the last ones included, is a list of steps. The current step is open and says exactly what to do: which panel, which button, which line, and what to type, with the values shown in code style. In the Arena the step names the faulty line by its number and its content, and shows the shape of the fix. Later steps show their label and open on a tap.
- **One line of why.** When a step turns green it collapses to a tick and one sentence on what just happened and why it matters.
- **Start here.** The first level of each zone points once at the control you begin with (the Send button, the terminal prompt, the code, the policy editor, the work products). On a phone the tab that holds it is marked too.
- **Mistakes say how to recover.** A wrong move shakes the sandbox and says what went wrong and what to try instead.
- **On a phone** the steps sit above the sandbox. Once you scroll past them, a bar at the top keeps the current step in sight and opens on a tap.
- **Terms you can hover.** Underlined words (session id, JWT, CORS, CVE...) open a one-line definition on hover or tap, and the full entry goes into your codex when you clear the level.
- **Show me.** Stuck? Show me does the next step for you and says what it did. It costs a star.
- **A result card.** One sentence on what you just did, what it is called in the real world, and stars from your Show me uses, failed attempts and time.

## Learn it, then prove it

Clearing a level with its steps opens its challenge. It is the same sandbox and the same idea with different values, built from a random seed: another hidden page, another cookie, other people's sessions, a different variable name and faulty line in the Arena, another subnet, service or CVE in the Perimeter, another bucket, office range or leaked key in the Cloud, another case to score or finding to write in the Report. Sometimes the developers' fix in the retest actually works, so you have to prove it either way.

A challenge shows only the goal and one sentence. There is a Hint button with up to three hints that go from a nudge to nearly the answer, and each one costs points. The clock runs against a par time. Stars come from hints and time, and the zone map shows two medals per level: guided and challenge. Clear every challenge in a zone for its badge. New variant gives you a fresh seed; the seed sits in the address, so a reload replays the same one.

## Live incidents

The last level of each zone is a live incident. A track across the top shows the attacker moving from recon to foothold to access to exfiltration, with a countdown to the breach and a counter of what is leaving. Every correct step pushes them back and holds them for a few seconds, and every mistake makes them a little faster. If they get out, a calm screen says what they took and you try again. The first guided run is gentle, a replay is quicker, and a challenge is harsh. The screen edge warms as they get further, an alert sounds when they reach a new stage, and with reduced motion on nothing pulses. On a phone the track sticks to the top of the screen.

## The case

You join the Watch, a small security consultancy in Lyon, on the morning Lantern & Co. finds its customers' invoices for sale online. Lantern is a lamp maker with a web shop and a warehouse on the docks called Harbor. Ines leads the team, Bruno reads logs and does the forensics, and Yasmin handles the cloud. Claire is Lantern's CTO.

The Basics comes first, before the client calls: your own workstation and lab-01, the Watch's practice server, which has spent the weekend on the internet with nobody watching. The Wire is how the attacker got close (the staff notes page, Mara's session copied on café Wi-Fi, an unsigned admin token). The Capture is the café's own Wi-Fi recording from that Sunday night, where the scan, the lookalike link and the copied cookie all show up, and Harbor's switch capture from the night the files left. The Arena is what they did inside the shop, from the log of every request they made. The Perimeter finds the warehouse machine they came through, the Cloud is where the data went, and the Report is the write-up for Claire. The Scanner is the last chapter: Lantern's own OpenVAS box, set up so the next hole shows up in their weekly report before it shows up on a forum.

A short scene opens each zone (skippable, and replayable from the zone map), and a teammate has a line in the header of each level about what you found before. The Case page is the incident board: a timeline of the attack and a pin for each level, saying what it proved, that fills in as you clear levels. Clearing the last boss closes the case.

## The arcade

Each zone has a bonus game that opens when you beat its boss. You can start it from the boss's result card, from the zone map, or from the Arcade page, which lists all eight with your best score and stars. A run takes a minute or two. Each game has a start screen with three lines on how to play, the keys, and a line from someone on the team about why it matters to the case. There is a pause (P or Esc, and it pauses by itself if you switch tabs), and a game over screen with your score, your best, the stars and what you got wrong.

- **Harden Up (The Basics).** Two versions of the same thing on lab-01 side by side, as a command prints it: a file's permissions from `ls -l`, a port from `ss`, a service from `systemctl` or `ps`, a firewall rule from `ufw`, a guest network and a printer address. Pick the locked-down one. The first rounds differ in one plain line (600 against 644, 127.0.0.1 against 0.0.0.0); then you need the rule (stopped but still enabled, a service running as root, SNMP on UDP); the last rounds hinge on one small detail, such as the order of two firewall rules or a /16 where a /24 was meant. It runs on the same engine and rules as Spot the Forgery.
- **Spot the Forgery (The Wire).** Each round shows the same request twice, side by side: the customer's real one and the attacker's copy with one line changed. You pick the forgery before the round clock runs out, then see the line that gave it away and why. Twelve rounds dealt from a seed: four plain ones (a role in a cookie, an unsigned token, another website as Origin, no login), four that need the rule (an expired token, a broken signature, a copied session, a customer on a staff page, a foreign preflight) and four subtle ones with a harmless second difference, so spotting what changed is not enough (lookalike origins, http instead of https, a token that expired two minutes ago, a role cookie next to a real session). A wrong pick or running out of time costs one of three lives; right picks in a row raise a multiplier. The clock stops while the answer is explained.
- **Sniffed (The Capture).** The same action seen in two captures, as Wireshark shows it: the protocol, the Info column and what Follow TCP Stream reads. Pick the one a listener learns more from. Plain against encrypted first (a login over HTTP, FTP, Telnet, Basic auth); then what still shows with HTTPS (DNS lookups, a cookie without Secure, the first request before a redirect); then pairs that hinge on one detail (the SNI, an upgrade to TLS that was refused, 13 MB leaving at night even though nobody can read it).
- **Hold the Line (The Arena).** Attacks walk two routes to the database: SQL injection, cross-site scripting, IDOR, command injection, SSRF and mass assignment, each drawn as its own shape with a label, never as an input. You place fixes on the tiles beside the routes, and each one stops only the attack it really fixes. A parameterised query does nothing against XSS, and the game says so when an attack walks past the wrong fix. The firewall slows everything and stops nothing. Each wave is shown before it starts. Too many attacks reaching the database ends the run.
- **Network Sweeper (The Perimeter).** A six by six grid of addresses on Harbor's network, built from a seed. Ping sweeps show which hosts are up, a port scan shows what is open and the scanner's guess at the version, a version check reads the real banner, and a lookup matches it to a CVE. You flag the vulnerable hosts before the attacker's bar fills. The scanner sometimes guesses a vulnerable version for a patched host, and flagging on the guess alone is a false positive. Probing the hatched hosts outside the signed scope gives the attacker time.
- **Lockdown (The Cloud).** Ten diagrams of Lantern's account, from one public bucket to the whole account. Red lines are routes the attacker has, green lines are people who need access. You change firewall rules, bucket policies and the role a server runs as, by tapping a rule and picking a setting or dragging a setting onto it, until no red line reaches the data and every green one still does. Several diagrams assume the web shop gets broken into, so its role matters as much as its firewall. Each one has a par for the number of changes, and the clock runs over the whole set.
- **Triage Rush (The Report).** Fourteen findings from the case arrive one at a time, each with its evidence. You set the severity with 1 to 4 before its timer runs out, and for a bonus you first pick the fact that drives the score, such as "no login needed". Exact answers in a row build a streak. At the end a scorecard lists every finding you misjudged with the right severity and why.
- **Fix First (The Scanner).** Two real results from Lantern's scans side by side, and one patch window: pick the one to fix first. Early rounds are decided by the score; then by proof over guesses (QoD), who can reach the machine and whether a login is needed; the last rounds put the same flaw on two machines so only the reach line or what the machine holds decides. The same rules as Spot the Forgery: a round clock, three lives, a streak multiplier and the reason after every call.

Stars come from score thresholds, and XP only from new stars, at most 100 per game, so the arcade never gets ahead of the levels. With reduced motion turned on, the games run a little slower and the attacker's lines in Lockdown stop moving.

## Feedback

A step turning green pops with a few sparks and a note. Correct moves in a row build a combo shown in the header; a hint, Show me or mistake breaks it with a sound. Your best combo multiplies the XP for the level, and a run with no mistakes and no help earns a clean-run bonus. Clearing a level closes the reticle over the sandbox before the result card counts up the XP. All sound is synthesised and the mute button sits in every header and is remembered.

## Today's case

The title screen has one unguided puzzle a day, picked from the date (UTC) among the zones you have open, so everyone with the same zones gets the same case. It works offline. It keeps a daily streak and your best result for each day, says "come back tomorrow" once it is solved, and gives you a result to copy and paste with the date, the zone, your stars and time and nothing about the puzzle.

## Study

The Study page follows the 12-week roadmap the game is built around, line by line, with the Italian original next to an English version. Each line shows the levels and codex entries that teach it, how many of them you have cleared, and which ones are still to come, plus the real lab to practise on afterwards (PortSwigger, TryHackMe, Hack The Box, Juice Shop). A second tab has 105 acronyms (CVE, KEV, CVSS, NAT, ASVS and the rest) as a list, as flashcards and as a quiz.

## The eight zones

Forty-eight levels in all. A zone opens when you clear the last level of the one before it.

- **The Basics: networks and Linux.** A shell on your workstation, then on lab-01. Read two CIDR blocks with `ipcalc` and find the printer sitting on the guest Wi-Fi; tell your private address (`ip addr`, `ip route`) from the public one the router puts on your traffic (`curl ifconfig.me`) and check the DNS name that points at it; find an SNMP service that only a UDP scan (`sudo nmap -sU`) shows, next to an open|filtered port that proves nothing; read `ls -la` and close a world-readable `.env` and a world-writable deploy script with `chmod`; find Redis listening on 0.0.0.0 with `ps` and `ss -tlnp` and switch it off now and at boot with `systemctl disable --now`; and, as a live incident with a brute-force run in `auth.log`, set up `ufw` (deny by default, SSH from the office only, HTTPS for everyone) in an order that does not lock you out of your own SSH session. Enable the firewall too early and the session drops.
- **The Wire: HTTP, cookies, sessions and tokens.** A small browser next to the raw request it sends. Change the path to find a page robots.txt gives away, change a cookie that says `role=user`, replay a session id caught on café Wi-Fi, flag a cookie HttpOnly and watch `document.cookie` stop showing it, forge a JWT with `alg: none` against a server that trusts it and one that doesn't, then lock down an API that hands its CORS permission to any origin.
- **The Capture: Wireshark.** A packet list with a display filter that reads Wireshark's own syntax (protocols, fields, `==`, `!=`, `contains`, `&&`, `||`, `!`, address ranges), a details pane that names the filter field behind every line with an Apply as Filter button, Follow TCP Stream, and Conversations. Cut a café capture down to Mara's three plain HTTP requests; read a three-way handshake and then a port scan of her laptop from the next table, with RSTs from the closed ports and a SYN-ACK from 445; find the lookalike domain her phishing link looked up; follow her request to read the session cookie in the clear and find the same cookie sent from the scanning laptop; read a staff password posted over plain HTTP, next to an HTTPS payment where only the server name (SNI) shows; and, as a live incident, use Conversations and a direction filter to find the upload leaving Harbor at night, past a bigger backup that never left, and read the file name off the stream.
- **The Arena: the OWASP Top 10, from the defending side.** Each level is a tiny app with its server code. An incident replay describes, in plain words, an attack that already happened and what it did. You click the line of code where the input did its damage, rewrite that region (a parameterised query, HTML encoding, an ownership check, `execFile` instead of a shell, a URL allow-list, picking fields from a request body), then press Replay attack. The recorded attack and its variants run against your code and must fail, and normal use must still work. The replays describe the input by category and never show a working payload.
- **The Perimeter: hosts, ports, versions and CVEs.** A terminal on a simulated network with `nmap` (`-sn`, `-p`, `-sV`, `-Pn`), `curl`, `nc`, `dig`, `whois`, `vulndb`, `cat`, `ls` and `man`, plus tab completion and history. You count live hosts, find an exposed database, match a version to its CVE, prove a scanner hit is a false positive from the live banner, and check a name against the signed scope before touching it.
- **The Cloud: buckets, IAM, firewalls, keys, code scanning and APIs.** A console with a live checker. Edit a bucket policy until strangers get 403 and the billing app still reads, cut an admin policy down to two actions, fix security group rules without locking out the office, rotate a key leaked in git history in an order that keeps deploys and backups running, triage five code-scan alerts by tracing them, and harden an API gateway.
- **The Report: method, score, write-up, retest, lab.** Put the products of an engagement in phase order, score an IDOR with a CVSS 3.1 calculator whose score moves as you set each metric, write a seven-field finding from the evidence you collected and read the client's comments field by field, retest a fix that only blocks one input, and wire Juice Shop and ZAP together in a compose file that keeps the app off the network.
- **The Scanner: OpenVAS.** A Greenbone console on Lantern's office network: find out the feed is two years old and that the scanner has never heard of regreSSHion, then sync it; build a target that covers the /24, leaves out the vendor's printer and does not trust ping; run a Full and fast scan and read the report by severity; lower the QoD filter to find two Apache results that only read a banner, override the patched one as a false positive with a reason and keep the real one; give the scan an SSH login and find PwnKit and Baron Samedit on a database server that looked clean from outside; match the report against CISA's Known Exploited Vulnerabilities (KEV) catalog to see which flaws attackers are already using and put the one anyone on the network can use first; and, as a live incident, make the scan weekly, compare two weeks in a delta report, spot the kiosk someone plugged in, and say what to fix next.

Clearing levels earns XP, ranks, badges and a daily streak, and fills the codex and the case board. Evidence collected in the earlier zones lands in your locker for the Report zone (anything missing comes from the case file). Progress is saved in `localStorage` and nothing is sent anywhere.

## On a phone

Everything works on a phone, and it installs like an app: open the site, then Share > Add to Home Screen on an iPhone, or Install app in Chrome on Android. After the first visit a service worker keeps every file of the game, so it opens and plays with no connection, on the metro or a plane. Progress stays on the device.

On a touch screen, the commands and filters printed in the steps are marked with a small return arrow and can be tapped: the command lands at the terminal prompt or in the filter bar, and you still press Run or Apply yourself. The terminal has on-screen Tab, Up, Down and Run keys for completion and history. Every text box uses 16px text so iOS does not zoom the page, and rows, menu links and buttons are sized for a finger. The Playwright run plays a level on an emulated iPhone by tapping, and loads and plays the game with the network switched off.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm test -- --run  # unit and component tests (Vitest)
npm run build      # production build into dist/
npm run e2e        # plays every level and every arcade game in a real browser (Playwright; set CHROME_PATH to use an installed Chrome)
```

## Stack

- Vite, React 19 and TypeScript (strict)
- TanStack Router (`/`, `/zones/$zoneId`, `/play/$levelId`, `/challenge/$levelId?seed=`, `/daily`, `/case`, `/ending`, `/codex`, `/profile`, `/arcade` and one route per game, such as `/arcade/spot-the-forgery?seed=`), with the level screens, the codex, the profile, the case board and each arcade game loaded only when opened
- Tailwind v4 plus a tokens stylesheet
- Zod for the save file (version 6) and its migration from every older version
- The Web Audio API for sound (no audio files)
- Vitest and Testing Library for unit and component tests, Playwright for the play-test

## How it is built

Every sandbox runs on simulations in `src/sim/`, all pure TypeScript with no network:

- `http.ts`: parsing raw requests, cookies and the browser's CORS rule, plus a SHA-256 and HMAC so the JWTs are real HS256 tokens.
- `wire.ts`: the small servers behind The Wire.
- `js.ts`, `sql.ts`, `arena.ts`: a tiny interpreter for the subset of JavaScript the Arena's handlers use, a one-table SQL engine and the six apps. Your fix is run, not pattern-matched, so any correct way of writing it passes. Hostile inputs are category markers that only stand for a kind of input.
- `terminal.ts`: the shell, the network and the tools' output formats.
- `pcap.ts`: packets built from conversations (a TCP connection with its handshake, data and close, a DNS lookup, background noise), the display filter parser and evaluator, Follow TCP Stream, Conversations and the packet details.
- `linux.ts`: the machine you are logged in to in The Basics: files with owners and modes, processes, listening sockets, systemd services and a ufw firewall where the first matching rule wins. The box's state is never stored: it is the level's starting box with every earlier command in your history replayed on it, so a change stays made and nothing else drifts. `ipcalc` lives here too.
- `cloud.ts`: an IAM-style policy evaluator (explicit deny first, then allow, otherwise denied), security group reachability, key rotation, triage and the gateway.
- `report.ts`: the client's reading of a finding, the phase order and a small YAML reader for the compose file.

Each simulation takes its values from the level, with the guided level's values as defaults. That is what makes the challenges possible: `src/content/challenges/` has one generator per level that takes a seeded random number generator and returns a full level of the same kind, two or three hints, and the solution the tests use. `tests/challenges.test.ts` solves every generator across 200 seeds by driving the same simulations, checks no variant starts solved, and checks the values really change from seed to seed.

The arcade games live in `src/arcade/`, one pure module per game (`forgery.ts`, `tower.ts`, `sweeper.ts`, `lockdown.ts`, `triage.ts`) with the screens in `src/arcade/games/`. Each game is a start function that takes a seed and a step function that takes the milliseconds since the last frame, so the tests can play thousands of runs without a browser. The screens are plain DOM and SVG redrawn on each animation frame. Every moving piece has a tile or a fixed slot: attacks keep a gap on their route that is wide enough for corners, the network is a grid and a finding has one slot on the table. The tests check that over long runs with good, bad and random players. They also check that each fix stops exactly one attack and the firewall none, that every seeded network can be won in time by a player who starts knowing nothing, that a breadth-first search solves every Lockdown diagram in exactly its par, and that every Triage Rush severity is what its CVSS vector scores. The Playwright run plays every game with the page clock under control, wins one run and loses another, checks the game over screen and the saved best, and plays Triage Rush on a phone-sized screen.

The rest is small pure modules in `src/engine/`: `combo.ts` (combo, XP multiplier, clean-run bonus), `incident.ts` (the incident as a reducer fed ticks and events), `daily.ts` (the day's pick and the share text), `caseboard.ts` (the board from the save) and `rng.ts`. The story's words are in `src/content/story.ts`.

Levels are data in `src/content/levels/`. Each one lists its goal, its note, its steps (each with a label, what to do, an optional example and the line it teaches), its Show me steps (each acts on the sandbox), the codex entries it unlocks and the evidence it hands over. `tests/content.test.ts` checks every level for a goal, a note of no more than two sentences, at least one Show me step, steps that match its success test, links that resolve and no literal attack strings. `tests/steps.test.ts` checks that every step says exactly what to do and what it taught. The same check for literal attack strings covers the arcade text too. The Playwright play-test clears every level using only the values it reads from the steps on screen, wins every boss incident, loses one to the clock and retries it, clears a challenge in each zone, solves a day's case and checks the share text, and walks through the story scenes, the case board and the ending.

## What is mocked

All of it. The shops, banks, networks, cloud account and API are invented and live in the browser. Addresses come from private and documentation ranges, and names end in `.example` or `.lan`. The CVE ids, CVSS formula and tool flags are real. It is a place to learn the ideas. Use them only on labs and on systems you are authorised to test.

Live: https://cybermaster-francesco-saponaro.netlify.app
