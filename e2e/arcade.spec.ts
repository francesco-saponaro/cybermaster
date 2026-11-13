import { test, expect, type Page } from '@playwright/test';
import { ZONES } from '../src/content/zones';
import { PAIR_BY_ID } from '../src/content/arcade/forgery';
import { startForgery, ROUNDS } from '../src/arcade/forgery';
import { FIX_BY_ID, FIX_PAIRS } from '../src/content/arcade/fixfirst';
import { HARDEN_BY_ID, HARDEN_PAIRS } from '../src/content/arcade/harden';
import { SNIFF_BY_ID, SNIFF_PAIRS } from '../src/content/arcade/sniffed';
import { SAFE_BY_ID, SAFE_PAIRS } from '../src/content/arcade/saferun';
import { AUDIT_BY_ID, AUDIT_PAIRS } from '../src/content/arcade/passfail';
import { FIXES } from '../src/content/arcade/defence';
import { startTower, COLS as TD_COLS } from '../src/arcade/tower';
import { startSweeper, targets, COLS as SW_COLS } from '../src/arcade/sweeper';
import { PUZZLES, OPTIONS } from '../src/content/arcade/lockdown';
import { initialConfig, solve } from '../src/arcade/lockdown';
import { DRIVERS, FINDING_BY_ID, SEVERITIES } from '../src/content/arcade/findings';

// The arcade games played in a real browser. The page clock is installed
// before the app loads, so a 90 second run takes a few seconds and the same
// seed always deals the same requests, waves, network and deck. Answers come
// from the same content and rules the page uses. Any console error fails.

const SAVE_KEY = 'cybermaster.save';
const run = () => ({ stars: 3, clears: 1, bestSeconds: 60, lastPlayedAt: '2026-11-08T10:00:00Z' });
const allBosses = Object.fromEntries(ZONES.flatMap((z) => z.levelIds).map((id) => [id, run()]));
const base = {
  version: 6,
  name: '',
  xp: 2000,
  levels: allBosses,
  codex: [] as string[],
  badges: [] as string[],
  streak: { count: 0, lastDay: '' },
  settings: { muted: true },
  evidence: [] as string[],
  zones: ['wire'] as string[],
  challenges: {},
  daily: { streak: { count: 0, lastDay: '' }, days: {} },
  story: { beats: ['wire', 'arena', 'perimeter', 'cloud', 'report', 'scanner'], closed: true },
  incidents: {},
  bestCombo: 0,
  arcade: {},
};

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, path: string, save: object = base) {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('cybermaster.recall', 'off'); }, [SAVE_KEY, JSON.stringify(save)] as const);
  await page.goto(path);
}

const readSave = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);

async function noSideScroll(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${what} scrolls sideways`).toBeLessThanOrEqual(0);
}

/** Lets time pass in the game, then gives React a moment to draw it. */
async function tick(page: Page, ms: number) {
  await page.clock.runFor(ms);
  await page.waitForTimeout(30);
}

async function start(page: Page, line: RegExp) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.ar-line')).toContainText(line);
  await expect(page.locator('.ar-how li')).toHaveCount(3);
  await page.locator('[data-start=true]').click();
  await expect(page.locator('.ar-hud')).toBeVisible();
}

/** The game over screen, and the best score it saved. */
async function gameOver(page: Page, gameId: string, title: RegExp) {
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 });
  const shown = Number((await page.getByTestId('final-score').innerText()).replace(/[^0-9]/g, ''));
  const save = await readSave(page);
  expect(save.version).toBe(6);
  expect(save.arcade[gameId].best).toBeGreaterThanOrEqual(shown);
  expect(save.arcade[gameId].plays).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(page.locator('.ar-over .big-stars')).toBeVisible();
  return shown;
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/arcade-${name}.png` });
}

// ---- The arcade page and its locks -------------------------------------------------

test('The arcade lists all ten games with their bests, and locks a game until its boss is beaten', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, '/arcade', { ...base, levels: { 'wire-cors': run() }, arcade: { 'spot-the-forgery': { best: 4200, stars: 1, plays: 2, lastPlayedAt: 'x' } } });
  await expect(page.getByRole('heading', { name: 'The arcade' })).toBeVisible();
  await expect(page.locator('.arcade-row')).toHaveCount(10);
  await expect(page.locator('.arcade-row').first()).toContainText('Harden Up');
  await expect(page.locator('.arcade-row').nth(1)).toContainText('Best 4,200');
  await expect(page.locator('.arcade-row').nth(2)).toContainText('Sniffed');
  await expect(page.locator('.arcade-row').nth(3)).toContainText('Opens when you beat Sign up as anyone, the boss of The Arena');
  await page.goto('/arcade/tower-defence');
  await expect(page.getByRole('heading', { name: 'Hold the Line is still locked' })).toBeVisible();
  // The zone page offers the bonus round once the boss is beaten.
  await page.goto('/zones/wire');
  await page.getByRole('link', { name: 'Play it again' }).click();
  await expect(page).toHaveURL(/\/arcade\/spot-the-forgery/);
  await expect(page.locator('[data-start=true]')).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- Spot the Forgery ---------------------------------------------------------------

test('Spot the Forgery: twelve rounds won by picking every forgery, then a run lost in three mistakes', async ({ page }) => {
  const errors = watchConsole(page);
  const dealt = startForgery(7);
  await open(page, '/arcade/spot-the-forgery?seed=7');
  await start(page, /Monday night/);
  for (let r = 0; r < ROUNDS; r++) {
    const pair = PAIR_BY_ID[dealt.rounds[r]!]!;
    await expect(page.locator('.sf-topic')).toContainText(pair.topic);
    await tick(page, 1000);
    if (r === 0) {
      await expect(page.locator('.sf-tip')).toBeVisible();
      await shot(page, 'forgery-1440');
    }
    await page.getByTestId(`card-${dealt.sides[r]}`).click();
    const explain = page.getByTestId('sf-explain');
    await expect(explain).toContainText(pair.why);
    await expect(page.locator(`[data-testid=card-${dealt.sides[r]}] [data-key=true]`)).toHaveCount(1);
    if (r === 9) await shot(page, 'forgery-reveal-1440');
    if (r === 0) {
      // The clock is stopped while the answer is explained: well past the round's time, nothing changes.
      const hud = await page.locator('.ar-hud').innerText();
      await tick(page, 20_000);
      expect(await page.locator('.ar-hud').innerText()).toBe(hud);
      await expect(page.getByTestId('sf-explain')).toBeVisible();
    }
    await page.keyboard.press('Enter');
  }
  const score = await gameOver(page, 'spot-the-forgery', /All twelve rounds done/);
  expect(score).toBeGreaterThan(3000);
  await expect(page.locator('.ar-review')).toHaveCount(0);

  // Wrong, too slow, wrong: out of lives, and the scorecard explains each one.
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.ar-hud')).toBeVisible();
  // The seed is in the address, so the second run deals the same rounds.
  const flip = (side: string) => (side === 'left' ? 'right' : 'left');
  for (let r = 0; r < 3; r++) {
    if (r === 1) await tick(page, 19_000);
    else await page.getByTestId(`card-${flip(dealt.sides[r]!)}`).click();
    await expect(page.getByTestId('sf-explain')).toContainText('−1 life');
    await page.keyboard.press('Enter');
  }
  await gameOver(page, 'spot-the-forgery', /Out of lives/);
  await expect(page.locator('.ar-review li')).toHaveCount(3);
  await expect(page.locator('.ar-review')).toContainText('The clock ran out.');
  await shot(page, 'forgery-over-1440');
  const save = await readSave(page);
  expect(save.arcade['spot-the-forgery'].best).toBe(score);
  expect(save.arcade['spot-the-forgery'].plays).toBe(2);
  expect(errors).toEqual([]);
});

test('Spot the Forgery pauses with P, stops the clock and shows the rules', async ({ page }) => {
  await open(page, '/arcade/spot-the-forgery?seed=3');
  await expect(page.locator('.ar-board-help li').first()).toBeVisible();
  await expect(page.getByTestId('game-rules')).toHaveAttribute('open', '');
  await start(page, /Monday night/);
  await tick(page, 3000);
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.getByTestId('game-rules')).toBeVisible();
  const before = await page.locator('.ar-hud').innerText();
  await tick(page, 10_000);
  expect(await page.locator('.ar-hud').innerText()).toBe(before);
  await page.keyboard.press('p');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
});

test('The old Packet Runner address opens Spot the Forgery', async ({ page }) => {
  await open(page, '/arcade/packet-runner');
  await expect(page).toHaveURL(/\/arcade\/spot-the-forgery/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Spot the Forgery');
});

// ---- Hold the Line -----------------------------------------------------------------

test('Hold the Line: every wave held with the right fixes in the middle column', async ({ page }) => {
  const errors = watchConsole(page);
  const seed = 11;
  const waves = startTower(seed).waves;
  await open(page, `/arcade/tower-defence?seed=${seed}`);
  await start(page, /Every attack in the log/);
  const placed = new Set<string>();
  const spots = [1, 3, 5, 6, 2, 4, 0, 7];
  for (let w = 0; w < waves.length; w++) {
    await expect(page.locator('.td-wave h2')).toContainText(`Wave ${w + 1} in`);
    for (const type of new Set(waves[w]!.map((u) => u.type))) {
      if (placed.has(type)) continue;
      const fix = FIXES.findIndex((f) => f.stops === type);
      await page.keyboard.press(String(fix + 1));
      const r = spots[placed.size]!;
      await page.locator('.td-tile').nth(r * TD_COLS + 3).click();
      placed.add(type);
    }
    await expect(page.locator('.td-tile[data-kind=fix]')).toHaveCount(placed.size);
    await page.keyboard.press('n');
    for (let t = 0; t < 40_000; t += 500) {
      await tick(page, 500);
      if (w === 2 && t === 2000) await shot(page, 'tower-1440');
      if ((await page.locator('.ar-over').count()) || (await page.locator('.td-wave h2').innerText()).includes(`Wave ${w + 2} in`)) break;
    }
  }
  const score = await gameOver(page, 'tower-defence', /The database held/);
  expect(score).toBeGreaterThanOrEqual(3400);
  expect(errors).toEqual([]);
});

test('Hold the Line: a wrong fix lets the attack through and says why', async ({ page }) => {
  await open(page, '/arcade/tower-defence?seed=2');
  await start(page, /Every attack in the log/);
  await page.keyboard.press('2');
  await page.locator('.td-tile').nth(1 * TD_COLS + 3).click();
  await page.keyboard.press('n');
  await expect(async () => {
    await tick(page, 300);
    await expect(page.locator('.td-msg')).toContainText(/Output escaping does nothing against sql injection|reached the database/);
  }).toPass({ timeout: 15_000 });
});

// ---- Network Sweeper ------------------------------------------------------------------

test('Network Sweeper: the weak hosts flagged from their banners, then a run lost to the clock', async ({ page }) => {
  const errors = watchConsole(page);
  const seed = 21;
  const board = startSweeper(seed);
  await open(page, `/arcade/network-sweeper?seed=${seed}`);
  await start(page, /Harbor's network/);
  // Sweep the first block for the screenshot, then check each weak host in order.
  await page.getByTestId('host').nth(1 * SW_COLS + 1).click();
  await page.keyboard.press('1');
  await shot(page, 'sweeper-1440');
  for (const h of targets(board)) {
    await page.locator(`[data-testid=host][data-ip="${h.ip}"]`).click();
    for (const k of ['2', '3', '4']) {
      await page.keyboard.press(k);
      await tick(page, 500);
    }
    await expect(page.locator('.sw-facts')).toContainText(/CVE-\d{4}-\d+/);
    await page.keyboard.press('f');
  }
  const score = await gameOver(page, 'network-sweeper', /Found before the attacker/);
  expect(score).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Play again' }).click();
  await tick(page, 100_000);
  await gameOver(page, 'network-sweeper', /The attacker got there first/);
  await expect(page.locator('.ar-review')).toContainText('was the weak one');
  expect(errors).toEqual([]);
});

// ---- Lockdown -----------------------------------------------------------------------

test('Lockdown: all ten diagrams locked down at par, by tapping rules and settings', async ({ page }) => {
  const errors = watchConsole(page);
  await open(page, '/arcade/lockdown');
  await start(page, /Lantern's account/);
  for (const p of PUZZLES) {
    await expect(page.locator('.ld-head h2')).toHaveText(p.title);
    const goal = solve(p).config!;
    const init = initialConfig(p);
    for (const slot of p.slots) {
      if (goal[slot.id] === init[slot.id]) continue;
      await page.locator(`[data-slot="${slot.id}"]`).click();
      await page.locator('.ld-option', { hasText: new RegExp(`^\\d?${OPTIONS[goal[slot.id]!].label}$`) }).click();
    }
    if (p.id === 'whole-account') await shot(page, 'lockdown-1440');
    await expect(page.locator('.ld-cleared')).toBeVisible();
    await tick(page, 1800);
  }
  const score = await gameOver(page, 'lockdown', /Every diagram locked down/);
  expect(score).toBeGreaterThanOrEqual(1700);
  await expect(page.locator('.ld-result')).toHaveCount(PUZZLES.length);
  expect(errors).toEqual([]);
});

test('Lockdown: a setting dragged from the tray onto a rule, and a wrong one that cuts someone off', async ({ page }) => {
  await open(page, '/arcade/lockdown');
  await start(page, /Lantern's account/);
  await page.locator('[data-slot="invoices-policy"]').click();
  await page.locator('.ld-option', { hasText: 'No one' }).click();
  await expect(page.locator('.ar-msg')).toContainText('Billing app can no longer reach Invoices bucket');
  await page.keyboard.press('r');
  await page.locator('[data-slot="invoices-policy"]').click();
  const from = await page.locator('.ld-option', { hasText: 'Billing role' }).boundingBox();
  const to = await page.locator('[data-slot="invoices-policy"]').boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 10);
  await page.mouse.down();
  await page.mouse.move(to!.x + 30, to!.y + 15, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ld-cleared')).toBeVisible();
});

// ---- Triage Rush ---------------------------------------------------------------------

test('Triage Rush on a phone: a whole deck by tapping, with two misjudged findings on the scorecard', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/arcade/triage-rush?seed=5');
  await start(page, /Claire wants every finding ranked/);
  await noSideScroll(page, 'Triage Rush');
  const missed: string[] = [];
  for (let i = 0; i < 14; i++) {
    const card = page.getByTestId('finding');
    await expect(card).toHaveAttribute('data-id', /.+/);
    const id = (await card.getAttribute('data-id'))!;
    const f = FINDING_BY_ID[id]!;
    await page.locator('.tr-chip', { hasText: DRIVERS[f.driver]! }).click();
    const wrong = i === 2 || i === 9;
    const sev = wrong ? SEVERITIES[(SEVERITIES.indexOf(f.severity) + 2) % 4]! : f.severity;
    if (wrong) missed.push(id);
    if (i === 4) await shot(page, 'triage-390');
    await page.locator(`.tr-sevbtn[data-sev="${sev}"]`).click();
    await expect(page.locator('.tr-verdict')).toBeVisible();
    await tick(page, 1300);
  }
  await gameOver(page, 'triage-rush', /12 of 14 ranked right/);
  const card = page.getByTestId('scorecard');
  await expect(card.locator('li')).toHaveCount(2);
  for (const id of missed) {
    await expect(card).toContainText(FINDING_BY_ID[id]!.title);
    await expect(card).toContainText(FINDING_BY_ID[id]!.reason);
  }
  await noSideScroll(page, 'Triage Rush game over');
  await shot(page, 'triage-over-390');
  expect(errors).toEqual([]);
});

// ---- Phone and desktop: every game mid-run --------------------------------------------

test('Every game mid-run at 390 and 1440: on screen, nothing wider than the screen', async ({ page }) => {
  const errors = watchConsole(page);
  const games: [string, string, (p: Page) => Promise<void>][] = [
    ['spot-the-forgery', 'forgery', async (p) => tick(p, 4000)],
    ['tower-defence', 'tower', async (p) => {
      await p.keyboard.press('1');
      await p.locator('.td-tile').nth(1 * TD_COLS + 3).click();
      await p.keyboard.press('n');
      await tick(p, 3000);
    }],
    ['network-sweeper', 'sweeper', async (p) => {
      await p.getByTestId('host').nth(1 * SW_COLS + 1).click();
      await p.getByRole('button', { name: /^Ping sweep/ }).click();
      await p.getByRole('button', { name: /^Port scan/ }).click();
    }],
    ['lockdown', 'lockdown', async (p) => {
      await p.locator('[data-slot]').first().click();
      await tick(p, 1000);
    }],
    ['triage-rush', 'triage', async (p) => tick(p, 2000)],
    ['fix-first', 'fixfirst', async (p) => tick(p, 3000)],
    ['harden-up', 'harden', async (p) => tick(p, 3000)],
    ['sniffed', 'sniffed', async (p) => tick(p, 3000)],
    ['safe-to-run', 'saferun', async (p) => tick(p, 3000)],
    ['pass-or-fail', 'passfail', async (p) => tick(p, 3000)],
  ];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    for (const [id, name, act] of games) {
      await open(page, `/arcade/${id}?seed=4`);
      await expect(page.locator('[data-start=true]')).toBeVisible();
      await noSideScroll(page, `${id} start at ${width}`);
      await page.locator('[data-start=true]').click();
      await act(page);
      await noSideScroll(page, `${id} at ${width}`);
      if (width < 500) {
        // The touch controls are on screen without scrolling sideways, and big enough to hit.
        for (const b of await page.locator('.ar-pad, .tr-sevbtn, .td-fix').all()) {
          const box = await b.boundingBox();
          if (box) expect(box.height, `${id} control height`).toBeGreaterThanOrEqual(40);
        }
      }
      await shot(page, `${name}-mid-${width}`);
    }
  }
  expect(errors).toEqual([]);
});

test('Fix First: twelve calls made right, with the reason after each one', async ({ page }) => {
  const errors = watchConsole(page);
  const dealt = startForgery(11, FIX_PAIRS);
  await open(page, '/arcade/fix-first?seed=11');
  await start(page, /Monday morning/);
  for (let r = 0; r < ROUNDS; r++) {
    const pair = FIX_BY_ID[dealt.rounds[r]!]!;
    await expect(page.locator('.sf-topic')).toContainText(pair.topic);
    await tick(page, 1000);
    await page.getByTestId(`card-${dealt.sides[r]}`).click();
    await expect(page.getByTestId('sf-explain')).toContainText(pair.rule);
    if (r === 6) await shot(page, 'fixfirst-reveal-1440');
    await page.keyboard.press('Enter');
  }
  await gameOver(page, 'fix-first', /All twelve calls made/);
  expect(errors).toEqual([]);
});

test('Harden Up: twelve boxes hardened, with the reason after each one', async ({ page }) => {
  const errors = watchConsole(page);
  const dealt = startForgery(5, HARDEN_PAIRS);
  await open(page, '/arcade/harden-up?seed=5');
  await start(page, /Practise on lab-01/);
  for (let r = 0; r < ROUNDS; r++) {
    const pair = HARDEN_BY_ID[dealt.rounds[r]!]!;
    await expect(page.locator('.sf-topic')).toContainText(pair.topic);
    await expect(page.locator('.sf-q')).toHaveText('Which one is locked down?');
    await tick(page, 1000);
    await page.getByTestId(`card-${dealt.sides[r]}`).click();
    await expect(page.getByTestId('sf-explain')).toContainText(pair.rule);
    if (r === 8) await shot(page, 'harden-reveal-1440');
    await page.keyboard.press('Enter');
  }
  await gameOver(page, 'harden-up', /All twelve boxes hardened/);
  expect(errors).toEqual([]);
});

test('Sniffed: twelve leaks caught, with the reason after each one', async ({ page }) => {
  const errors = watchConsole(page);
  const dealt = startForgery(8, SNIFF_PAIRS);
  await open(page, '/arcade/sniffed?seed=8');
  await start(page, /café Wi-Fi/);
  for (let r = 0; r < ROUNDS; r++) {
    const pair = SNIFF_BY_ID[dealt.rounds[r]!]!;
    await expect(page.locator('.sf-topic')).toContainText(pair.topic);
    await tick(page, 1000);
    await page.getByTestId(`card-${dealt.sides[r]}`).click();
    await expect(page.getByTestId('sf-explain')).toContainText(pair.rule);
    await page.keyboard.press('Enter');
  }
  await gameOver(page, 'sniffed', /All twelve leaks caught/);
  expect(errors).toEqual([]);
});

for (const [id, pairs, byId, line, won] of [
  ['safe-to-run', SAFE_PAIRS, SAFE_BY_ID, /nothing breaks/, /Twelve calls by the rules/],
  ['pass-or-fail', AUDIT_PAIRS, AUDIT_BY_ID, /small yes-or-no calls/, /Twelve controls audited/],
] as const) {
  test(`${id}: twelve rounds won, with the reason after each one`, async ({ page }) => {
    const errors = watchConsole(page);
    const dealt = startForgery(6, pairs);
    await open(page, `/arcade/${id}?seed=6`);
    await start(page, line);
    for (let r = 0; r < ROUNDS; r++) {
      const pair = byId[dealt.rounds[r]!]!;
      await expect(page.locator('.sf-topic')).toContainText(pair.topic);
      await tick(page, 1000);
      await page.getByTestId(`card-${dealt.sides[r]}`).click();
      await expect(page.getByTestId('sf-explain')).toContainText(pair.rule);
      await page.keyboard.press('Enter');
    }
    await gameOver(page, id, won);
    expect(errors).toEqual([]);
  });
}
