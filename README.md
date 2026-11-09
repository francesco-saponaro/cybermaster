# CyberMaster

A browser game that teaches cybersecurity by having you do the work in small sandboxes. You edit a raw HTTP request and watch the page change, find the line of server code that let an attack through and fix it, sweep a network from a terminal, close a public bucket, and write the finding a client will read.

I built it because I learn a subject fastest when I can poke at it and see what happens. The first version was a set of quizzes with a game skin, and it assumed you already knew the answers. This version works the other way round. Each level gives you one new idea, a two-sentence note in the corner, and a sandbox. You act, and the sandbox reacts straight away. A level is cleared when its checks turn green, which depends on the state of the sandbox, not on picking an answer.

## How a level plays

- **A goal and a short note.** Ines, your lead, says what to do in at most two sentences. The first levels of each zone tell you exactly what to type or click. Later ones only give you the goal.
- **Terms you can hover.** Underlined words (session id, JWT, CORS, CVE...) open a one-line definition on hover or tap, and the full entry goes into your codex when you clear the level.
- **Live checks.** A list of checks sits beside the sandbox, like a test suite. Each one turns green as soon as the sandbox reaches that state, and a red one says why in a line.
- **Show me.** Stuck? Show me does the next step for you and says what it did. It costs a star.
- **A result card.** One sentence on what you just did, what it is called in the real world, and stars from your Show me uses, failed attempts and time.

## The five zones

Thirty levels in all. A zone opens when you clear the last level of the one before it.

- **The Wire: HTTP, cookies, sessions and tokens.** A small browser next to the raw request it sends. Change the path to find a page robots.txt gives away, change a cookie that says `role=user`, replay a session id caught on café Wi-Fi, flag a cookie HttpOnly and watch `document.cookie` stop showing it, forge a JWT with `alg: none` against a server that trusts it and one that doesn't, then lock down an API that hands its CORS permission to any origin.
- **The Arena: the OWASP Top 10, from the defending side.** Each level is a tiny app with its server code. An incident replay describes, in plain words, an attack that already happened and what it did. You click the line of code where the input did its damage, rewrite that region (a parameterised query, HTML encoding, an ownership check, `execFile` instead of a shell, a URL allow-list, picking fields from a request body), then press Replay attack. The recorded attack and its variants run against your code and must fail, and normal use must still work. The replays describe the input by category and never show a working payload.
- **The Perimeter: hosts, ports, versions and CVEs.** A terminal on a simulated network with `nmap` (`-sn`, `-p`, `-sV`, `-Pn`), `curl`, `nc`, `dig`, `whois`, `vulndb`, `cat`, `ls` and `man`, plus tab completion and history. You count live hosts, find an exposed database, match a version to its CVE, prove a scanner hit is a false positive from the live banner, and check a name against the signed scope before touching it.
- **The Cloud: buckets, IAM, firewalls, keys, code scanning and APIs.** A console with a live checker. Edit a bucket policy until strangers get 403 and the billing app still reads, cut an admin policy down to two actions, fix security group rules without locking out the office, rotate a key leaked in git history in an order that keeps deploys and backups running, triage five code-scan alerts by tracing them, and harden an API gateway.
- **The Report: method, score, write-up, retest, lab.** Put the products of an engagement in phase order, score an IDOR with a CVSS 3.1 calculator whose score moves as you set each metric, write a seven-field finding from the evidence you collected and read the client's comments field by field, retest a fix that only blocks one input, and wire Juice Shop and ZAP together in a compose file that keeps the app off the network.

Clearing levels earns XP, ranks, badges and a daily streak, and fills the codex. Evidence collected in the earlier zones lands in your locker for the Report zone (anything missing comes from the case file). Progress is saved in `localStorage` and nothing is sent anywhere.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm test -- --run  # unit and component tests (Vitest)
npm run build      # production build into dist/
npm run e2e        # plays levels in a real browser (Playwright; set CHROME_PATH to use an installed Chrome)
```

## Stack

- Vite, React 19 and TypeScript (strict)
- TanStack Router (`/`, `/zones/$zoneId`, `/play/$levelId`, `/codex`, `/profile`)
- Tailwind v4 plus a tokens stylesheet
- Zod for the save file and its migration from older versions
- The Web Audio API for sound (no audio files)
- Vitest and Testing Library for unit and component tests, Playwright for the play-test

## How it is built

Every sandbox runs on simulations in `src/sim/`, all pure TypeScript with no network:

- `http.ts`: parsing raw requests, cookies and the browser's CORS rule, plus a SHA-256 and HMAC so the JWTs are real HS256 tokens.
- `wire.ts`: the small servers behind The Wire.
- `js.ts`, `sql.ts`, `arena.ts`: a tiny interpreter for the subset of JavaScript the Arena's handlers use, a one-table SQL engine and the six apps. Your fix is run, not pattern-matched, so any correct way of writing it passes. Hostile inputs are category markers that only stand for a kind of input.
- `terminal.ts`: the shell, the network and the tools' output formats.
- `cloud.ts`: an IAM-style policy evaluator (explicit deny first, then allow, otherwise denied), security group reachability, key rotation, triage and the gateway.
- `report.ts`: the client's reading of a finding, the phase order and a small YAML reader for the compose file.

Levels are data in `src/content/levels/`. Each one lists its goal, its note, its checks, its Show me steps (each step acts on the sandbox), the codex entries it unlocks and the evidence it hands over. `tests/content.test.ts` checks every level for a goal, a note of no more than two sentences, at least one Show me step, checks that match its success test, and links that resolve.

## What is mocked

All of it. The shops, banks, networks, cloud account and API are invented and live in the browser. Addresses come from private and documentation ranges, and names end in `.example` or `.lan`. The CVE ids, CVSS formula and tool flags are real. It is a place to learn the ideas. Use them only on labs and on systems you are authorised to test.

Live: https://cybermaster-francesco-saponaro.netlify.app
