# CyberMaster

A browser game that teaches cybersecurity. You join "the Watch", a security team of one, and
work your way from reading raw HTTP to writing a finding a client can act on. It is a real game,
not a quiz with a skin: every mission is its own small mechanic, with XP, levels, ranks, badges,
a daily streak and a codex that fills with what you have proved you understand.

I built it because the fastest way I learn a subject is to make something playable out of it. The
curriculum follows a cybersecurity study plan: the four technical areas, the assessment process,
how a finding is written, CVE and CVSS, false positives, and the home lab you practise in. Every
fact the game teaches is meant to be correct; where a topic is simplified, it is simplified
without becoming wrong.

## What it is

Five zones, each one part of the job, unlocking in order. Twenty-plus missions plus a boss at the
end of every zone.

- **The Wire** — HTTP, cookies, sessions and tokens. Read raw traffic and find what leaks; fix the
  auth flows that trust the wrong thing.
- **The Arena** — the OWASP Top 10. A top-down lane where the attacks come at you by name and you
  neutralise each with the right defence.
- **The Perimeter** — hosts, ports, versions, CVEs and CVSS. Sweep a host on a radar, score what
  you find, and judge what the scanner says.
- **The Cloud** — buckets, IAM, security groups, APIs and the code behind them. Audit configs and
  break (then fix) object-level authorization.
- **The Report** — the six phases of an assessment, the seven fields of a finding, the standards,
  and the lab. The boss is building a finding from fragments.

Mechanics include a packet inspector, a fix-the-bug matcher, the OWASP arena, a port-sweep radar,
a CVSS forge (eight dials, a live base score), a scanner-triage stream, a cloud config auditor, an
API gate for IDOR/BOLA, a phase-ordering puzzle and the final report builder.

Progress is saved in `localStorage`, so it survives a reload. There is no backend and nothing is
sent anywhere.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm test -- --run  # unit and component tests
npm run build      # production build into dist/
npm run preview    # serve the built app
```

## Stack

- Vite, React and TypeScript (strict)
- TanStack Router for the routes (`/`, `/zones/$zoneId`, `/missions/$missionId`, `/codex`, `/profile`)
- Tailwind v4 plus a tokens stylesheet for the design system
- Canvas and `requestAnimationFrame` for the action missions; the Web Audio API for the sound
  effects (no audio files)
- Zod for the save-file schema and its migration
- Vitest and Testing Library for the tests

## Add a mission

All content lives in a data layer, separate from the engine:

- `src/content/zones.ts` — the five zones and the mission ids in each
- `src/content/codex.ts` — the codex entries a mission unlocks
- `src/content/missions/*.ts` — the missions themselves, typed by `src/content/types.ts`

To add a mission: write a new object in the right zone file whose `kind` is one of the existing
mechanics (`inspect`, `match`, `arena`, `sweep`, `cvss`, `triage`, `audit`, `api`, `order`,
`report`, `boss`), give it a unique `id`, list the `codex` entries it unlocks, and add its `id` to
the zone's `missionIds` in `zones.ts`. The engine renders it from the data; you do not touch a
component. The integrity test in `tests/content.test.ts` checks that every mission has a real zone,
every codex id resolves, there are no duplicates and each mechanic's data is well formed, so a
mistake shows up as a failing test.

The scoring, the CVSS calculator, the save migration and the progression maths are pure functions
in `src/engine/`, each covered by tests.

## What is mocked

Everything the missions describe is sample data written to be realistic and correct: the captures,
scan outputs, cloud configurations and API responses are illustrative, and any addresses, hosts and
names are invented. The CVSS vectors are real and their scores are checked against the published
FIRST examples. There is no live target: the game is a place to learn the ideas, to be applied only
on labs and systems you are authorised to test.


Live: https://cybermaster-francesco-saponaro.netlify.app
