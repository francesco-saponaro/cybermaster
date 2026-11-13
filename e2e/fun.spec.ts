import { test, expect, devices, type Page } from '@playwright/test';
import { generateChallenge, type ChallengeVariant } from '../src/content/challenges';
import { listing } from '../src/sim/arena';
import { METRIC_LABELS, METRICS, parseVector } from '../src/engine/cvss';
import { dailyPick, shareText, utcDay } from '../src/engine/daily';
import { openLevels } from '../src/engine/progress';
import { ZONES } from '../src/content/zones';
import { LEVEL_BY_ID } from '../src/content/index';

// The challenges, the live incidents, today's case and the story, played in a
// real browser. Challenge answers come from the same generator and seed the
// page uses, so a pass shows the variant in the browser is the one the tests
// solve. Any console error fails the run.

const SAVE_KEY = 'cybermaster.save';
const run = (stars = 3) => ({ stars, clears: 1, bestSeconds: 60, lastPlayedAt: '2026-11-08T10:00:00Z' });
const base = {
  version: 5,
  name: '',
  xp: 0,
  levels: {} as Record<string, ReturnType<typeof run>>,
  codex: [] as string[],
  badges: [] as string[],
  streak: { count: 0, lastDay: '' },
  settings: { muted: true },
  evidence: [] as string[],
  zones: ['wire'] as string[],
  challenges: {},
  daily: { streak: { count: 0, lastDay: '' }, days: {} },
  story: { beats: ['wire', 'arena', 'perimeter', 'cloud', 'report'], closed: false },
  incidents: {},
  bestCombo: 0,
};
const ALL = ZONES.flatMap((z) => z.levelIds);
const cleared = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, run()]));

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function seed(page: Page, save: object) {
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(save)] as const);
}

const readSave = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);

async function noSideScroll(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${what} scrolls sideways`).toBeLessThanOrEqual(0);
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function terminal(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: 'Command' });
  await expect(input).toBeEnabled();
  await input.fill(line);
  await input.press('Enter');
  await expect(input).toBeEnabled({ timeout: 8000 });
}

/** Clear a challenge variant through the UI, the way a player who knows the answer would. */
async function solveInBrowser(page: Page, v: ChallengeVariant) {
  const l = v.level;
  const sol = v.solution;
  if (l.kind === 'wire' && sol.kind === 'wire' && l.server === 'shop') {
    await btn(page, 'Send').click();
    for (const path of ['/robots.txt', l.params!.shop!.hidden]) {
      await page.getByLabel('Address bar path').fill(path);
      await page.getByLabel('Address bar path').press('Enter');
    }
    return;
  }
  if (l.kind === 'arena' && sol.kind === 'arena') {
    const fault = listing(l.custom!, l.custom!.code.edit).fault;
    await page.getByRole('button', { name: new RegExp(`^Line ${fault}:`) }).click();
    await page.getByLabel('Your fix (editable)').fill(sol.fix);
    await btn(page, 'Replay attack').click();
    return;
  }
  if (l.kind === 'terminal' && sol.kind === 'terminal') {
    for (const c of sol.commands) await terminal(page, c);
    return;
  }
  if (l.kind === 'cloud' && sol.kind === 'cloud' && l.panel === 'bucket') {
    await page.getByLabel('Bucket policy JSON').fill(sol.text!);
    await page.getByRole('switch', { name: 'Block all public access' }).click();
    return;
  }
  if (l.kind === 'cloud' && sol.kind === 'cloud' && l.panel === 'gateway') {
    await page.getByLabel('Gateway config JSON').fill(sol.text!);
    return;
  }
  if (l.kind === 'report' && l.panel === 'cvss') {
    const v2 = parseVector(l.target);
    for (const m of METRICS) await page.getByRole('group', { name: METRIC_LABELS[m].name }).getByRole('button', { name: METRIC_LABELS[m].values[v2[m]]!, exact: true }).click();
    return;
  }
  throw new Error(`no browser solver for ${l.id}`);
}

async function challengeCleared(page: Page) {
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('dialog')).toContainText(/Challenge (boss )?cleared/);
}

// ---- Learn it, then prove it --------------------------------------------------

test('Each zone: clear a guided level, then its challenge from the zone map', async ({ page }) => {
  const errors = watchConsole(page);
  // The report pick is its second level, so the first is already cleared.
  await seed(page, { ...base, zones: ['wire', 'arena', 'perimeter', 'cloud', 'report'], levels: cleared(['report-phases']) });
  const picks: [string, string, (p: Page) => Promise<void>][] = [
    ['wire', 'wire-robots', async (p) => {
      await btn(p, 'Send').click();
      await p.getByLabel('Address bar path').fill('/robots.txt');
      await p.getByLabel('Address bar path').press('Enter');
      await p.getByLabel('Address bar path').fill('/staff-notes');
      await p.getByLabel('Address bar path').press('Enter');
    }],
    ['arena', 'arena-sqli', async (p) => {
      await p.getByRole('button', { name: /^Line 3:/ }).click();
      await p.getByLabel('Your fix (editable)').fill("  const sql = 'SELECT * FROM users WHERE name = ? AND pass = ?';\n  const rows = db.query(sql, [name, pass]);");
      await btn(p, 'Replay attack').click();
    }],
    ['perimeter', 'perimeter-sweep', async (p) => {
      await terminal(p, 'nmap -sn 10.0.8.0/24');
      await terminal(p, 'submit 5');
    }],
    ['cloud', 'cloud-bucket', async (p) => {
      const policy = JSON.parse(await p.getByLabel('Bucket policy JSON').inputValue());
      policy.Statement = policy.Statement.filter((x: { Sid: string }) => x.Sid !== 'PublicRead');
      await p.getByLabel('Bucket policy JSON').fill(JSON.stringify(policy, null, 2));
      await p.getByRole('switch', { name: 'Block all public access' }).click();
    }],
    ['report', 'report-cvss', async (p) => {
      for (const [g, b] of [['Attack vector', 'Network'], ['Attack complexity', 'Low'], ['Privileges required', 'Low'], ['User interaction', 'None'], ['Confidentiality', 'High']]) {
        await p.getByRole('group', { name: g! }).getByRole('button', { name: b!, exact: true }).click();
      }
    }],
  ];
  for (const [zone, id, guided] of picks) {
    await page.goto(`/zones/${zone}`);
    const medal = page.getByRole('link', { name: new RegExp(`^Challenge for ${LEVEL_BY_ID[id]!.title}`) });
    // Before the guided clear, the challenge is not offered as a link.
    await expect(page.locator('.zstop').filter({ hasText: 'after the steps' }).first()).toBeVisible();
    await page.goto(`/play/${id}`);
    await guided(page);
    await expect(page.getByRole('dialog')).toContainText(/cleared/, { timeout: 8000 });

    // The zone map now offers its challenge; it opens with a seed in the address.
    await page.goto(`/zones/${zone}`);
    await medal.first().click();
    await expect(page).toHaveURL(/\/challenge\/[\w-]+\?seed=\d+/);
    const seed = Number(new URL(page.url()).searchParams.get('seed'));
    const v = generateChallenge(id, seed)!;
    // No steps: only the goal, the brief and a hint button.
    await expect(page.locator('.lv-aside .steps')).toHaveCount(0);
    await expect(page.locator('.lv-aside')).toContainText(v.level.goal);
    await expect(page.getByRole('button', { name: /^Hint, -100$/ })).toBeVisible();
    await solveInBrowser(page, v);
    await challengeCleared(page);
    await expect(page.getByRole('dialog')).toContainText('Points');
    await page.getByRole('link', { name: 'Zone map' }).click();
    await expect(page.getByRole('link', { name: /of 3 stars/ }).first()).toBeVisible();
  }
  const save = await readSave(page);
  expect(Object.keys(save.challenges).sort()).toEqual(['arena-sqli', 'cloud-bucket', 'perimeter-sweep', 'report-cvss', 'wire-robots']);
  expect(errors).toEqual([]);
});

test('A challenge with hints: each costs points, and New variant changes the values', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, { ...base, levels: cleared(['wire-robots']) });
  await page.goto('/challenge/wire-robots?seed=4242');
  const v = generateChallenge('wire-robots', 4242)!;
  await btn(page, 'Hint, -100').click();
  await expect(page.locator('.hint-list li')).toHaveCount(1);
  await btn(page, 'Hint, -150').click();
  await btn(page, 'Hint, -250').click();
  await expect(page.locator('.hint-list')).toContainText(v.hints[2]!.replace(/`/g, ''));
  await expect(btn(page, 'No hints left')).toBeDisabled();
  await solveInBrowser(page, v);
  await challengeCleared(page);
  await expect(page.getByRole('dialog').getByLabel('1 of 3 stars')).toBeVisible();
  await btn(page, 'New variant').click();
  await expect(page).not.toHaveURL(/seed=4242/);
  expect(errors).toEqual([]);
});

// ---- Live incidents ----------------------------------------------------------------

test('A boss lost to the clock, then retried and won', async ({ page }) => {
  const errors = watchConsole(page);
  await page.clock.install();
  await seed(page, { ...base, zones: ['wire', 'arena', 'perimeter'], levels: cleared(ZONES.find((z) => z.id === 'perimeter')!.levelIds.slice(0, 5)) });
  await page.goto('/play/perimeter-boss');
  const inc = page.getByRole('region', { name: 'Live incident' });
  await expect(inc).toHaveAttribute('data-status', 'running');
  await expect(inc).toContainText('Recon');
  // Nobody touches anything: the attacker runs through every stage.
  await page.clock.runFor(16 * 60 * 1000);
  const lost = page.getByRole('dialog');
  await expect(lost).toContainText('The attacker got out.');
  await expect(lost).toContainText('Files copied');
  expect((await readSave(page)).incidents['perimeter-boss']).toEqual({ won: 0, lost: 1 });
  await btn(page, 'Try again').click();
  await expect(inc).toHaveAttribute('data-status', 'running');
  await expect(inc).toHaveAttribute('data-stage', '0');
  // A wrong submit speeds them up a little; correct steps push them back.
  await terminal(page, 'submit CVE-2021-41773');
  await terminal(page, 'nmap -sV 10.0.9.0/24');
  await expect(inc).toHaveAttribute('data-frozen', 'true');
  await terminal(page, 'nc -v 10.0.9.9 21');
  await terminal(page, 'vulndb proftpd 1.3.5');
  await terminal(page, 'submit CVE-2015-3306');
  await expect(page.getByRole('dialog')).toContainText(/cleared/, { timeout: 8000 });
  await expect(inc).toHaveAttribute('data-status', 'contained');
  expect((await readSave(page)).incidents['perimeter-boss']).toEqual({ won: 1, lost: 1 });
  expect(errors).toEqual([]);
});

test('A challenge boss runs a harsher incident and can be won', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, { ...base, zones: ['wire', 'arena', 'perimeter', 'cloud'], levels: cleared(['cloud-gateway']) });
  await page.goto('/challenge/cloud-gateway?seed=99');
  const inc = page.getByRole('region', { name: 'Live incident' });
  await expect(inc).toHaveAttribute('data-status', 'running');
  await expect(inc).toContainText('customers out');
  await solveInBrowser(page, generateChallenge('cloud-gateway', 99)!);
  await challengeCleared(page);
  await expect(inc).toHaveAttribute('data-status', 'contained');
  expect(errors).toEqual([]);
});

// ---- Feedback ------------------------------------------------------------------------

test('Combo, clean run and a mute toggle that survives a reload', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, base);
  await page.goto('/play/wire-robots');
  await btn(page, 'Send').click();
  await page.getByLabel('Address bar path').fill('/robots.txt');
  await page.getByLabel('Address bar path').press('Enter');
  await expect(page.locator('.combo')).toContainText('x2');
  // A green step pops with sparks next to it.
  await expect(page.locator('.lv-aside .step[data-check="robots"] .burst')).toHaveCount(1);
  await page.getByLabel('Address bar path').fill('/staff-notes');
  await page.getByLabel('Address bar path').press('Enter');
  const result = page.getByRole('dialog');
  await expect(result).toContainText(/cleared/, { timeout: 8000 });
  await expect(result).toContainText('Best combo, x1.2');
  await expect(result).toContainText('Clean run');
  expect((await readSave(page)).badges).toContain('clean-run');

  // A mistake breaks the combo.
  await btn(page, 'Play again').click();
  await btn(page, 'Send').click();
  await page.getByLabel('Address bar path').fill('/robots.txt');
  await page.getByLabel('Address bar path').press('Enter');
  await expect(page.locator('.combo')).toContainText('x2');
  await page.getByLabel('Raw HTTP request').fill('NOPE');
  await btn(page, 'Send').click();
  await expect(page.locator('.combo')).toContainText('Combo lost');

  // Sound: off in the seed, on with one click, still on after a reload.
  await page.getByRole('button', { name: 'Unmute sound' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
  expect((await readSave(page)).settings.muted).toBe(false);
  expect(errors).toEqual([]);
});

// ---- Today's case ------------------------------------------------------------------------

test("Today's case: the same puzzle for the date, a streak, a share text and come back tomorrow", async ({ page, context }) => {
  const errors = watchConsole(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Find a day whose case, with The Basics and The Wire open, is the robots level, and play on that day.
  const wire = openLevels(base as never, ZONES.map((z) => ({ id: z.id, levelIds: z.levelIds })));
  let day = '';
  for (let i = 0; i < 400 && !day; i++) {
    const d = utcDay(new Date(Date.UTC(2026, 10, 9 + i)));
    if (dailyPick(d, wire)!.levelId === 'wire-robots') day = d;
  }
  expect(day).not.toBe('');
  await page.clock.install({ time: new Date(`${day}T12:00:00Z`) });
  await seed(page, base);
  await page.goto('/');
  const card = page.getByRole('region', { name: 'The Wire' });
  await expect(card).toContainText("Today's case");
  await card.getByRole('link', { name: "Open today's case" }).click();
  await expect(page).toHaveURL(/\/daily$/);
  await expect(page.locator('.lv-title')).toContainText("Today's case");
  const pick = dailyPick(day, wire)!;
  await solveInBrowser(page, generateChallenge(pick.levelId, pick.seed)!);
  const result = page.getByRole('dialog');
  await expect(result).toContainText("Today's case solved", { timeout: 8000 });
  const preview = await result.getByLabel('Your result to share').textContent();
  expect(preview).toMatch(new RegExp(`^CyberMaster daily ${day}\\nThe Wire\\n[★☆]{3} \\d+:\\d\\d\\nNo hints, streak 1$`));
  expect(preview).not.toMatch(/robots|staff|Disallow/i);
  await btn(page, 'Copy result').click();
  await expect(btn(page, 'Copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(preview);
  const save = await readSave(page);
  expect(save.daily.days[day]).toMatchObject({ levelId: 'wire-robots', hints: 0 });
  expect(save.daily.streak).toEqual({ count: 1, lastDay: day });
  expect(shareText({ day, zone: 'The Wire', stars: save.daily.days[day].stars, seconds: save.daily.days[day].seconds, hints: 0, streak: 1 })).toBe(preview);
  await page.getByRole('link', { name: 'Back to the title' }).click();
  await expect(card).toContainText('Come back tomorrow');
  await expect(card.getByRole('button', { name: 'Copy result' })).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- The story -------------------------------------------------------------------------------

test('Story beats show once per zone, can be skipped and replayed; the case board fills in; the ending closes it', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, { ...base, story: { beats: [], closed: false } });
  await page.goto('/zones/wire');
  const beat = page.getByRole('region', { name: 'Briefing for The Wire' });
  await expect(beat).toContainText('Lantern & Co. called at eight');
  await expect(beat.locator('.beat-lines li')).toHaveCount(3);
  await btn(page, 'Skip').click();
  await expect(beat).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.zmap')).toBeVisible();
  await expect(beat).toHaveCount(0);
  await btn(page, 'Replay the briefing').click();
  await expect(beat).toBeVisible();
  await btn(page, 'Get to work').click();
  await expect(beat).toHaveCount(0);
  // Locked zones keep their briefing for later.
  await page.goto('/zones/cloud');
  await expect(page.locator('.beat')).toHaveCount(0);

  // A teammate's remark in the level header refers to what was found earlier.
  await seed(page, { ...base, zones: ['wire', 'arena'], levels: cleared(['wire-robots', 'wire-replay', 'arena-idor']) });
  await page.goto('/play/arena-sqli');
  await expect(page.locator('.brief-remark')).toContainText('/admin-old');

  await page.goto('/case');
  await expect(page.locator('.pin[data-found="true"]')).toHaveCount(3);
  // Three moments those levels prove, and the call that started it all.
  await expect(page.locator('.tl li[data-found="true"]')).toHaveCount(4);
  await expect(page.getByRole('link', { name: 'Close the case' })).toHaveCount(0);

  // Everything cleared: the board offers the ending, and the ending closes the case.
  await seed(page, { ...base, zones: ['wire', 'arena', 'perimeter', 'cloud', 'report'], levels: cleared(ALL) });
  await page.goto('/case');
  await expect(page.locator('.pin[data-found="true"]')).toHaveCount(ALL.length);
  await page.getByRole('link', { name: 'Close the case' }).click();
  await expect(page.getByRole('heading', { name: 'The Lantern & Co. case' })).toBeVisible();
  await expect(page.locator('.ending-lines li')).toHaveCount(4);
  await expect.poll(async () => (await readSave(page)).story.closed).toBe(true);
  expect((await readSave(page)).badges).toContain('case-closed');
  expect(errors).toEqual([]);
});

// ---- Phone and desktop: the new screens ------------------------------------------------------

test('New screens fit at 390 and 1440, with screenshots for review', async ({ page }) => {
  const errors = watchConsole(page);
  const mid = { ...base, zones: ['wire', 'arena', 'perimeter', 'cloud'], levels: cleared(ALL.slice(0, 23)), challenges: { 'wire-robots': { stars: 2, clears: 1, bestSeconds: 40, bestPoints: 850, lastPlayedAt: '' }, 'wire-jwt': { stars: 3, clears: 1, bestSeconds: 40, bestPoints: 1000, lastPlayedAt: '' } } };
  const screens: [string, object, string][] = [
    ['/', mid, 'title'],
    ['/zones/wire', mid, 'zone-medals'],
    ['/challenge/arena-idor?seed=31', mid, 'challenge'],
    ['/play/cloud-gateway', mid, 'boss-incident'],
    ['/case', mid, 'case'],
    ['/ending', { ...mid, zones: ['wire', 'arena', 'perimeter', 'cloud', 'report'], levels: cleared(ALL) }, 'ending'],
    ['/zones/perimeter', { ...mid, story: { beats: [], closed: false } }, 'beat'],
  ];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const [path, save, name] of screens) {
      await seed(page, save);
      await page.goto(path);
      await page.waitForTimeout(name === 'boss-incident' ? 2500 : 900);
      await noSideScroll(page, `${path} at ${width}`);
      await page.screenshot({ path: `test-results/fun-${name}-${width}.png`, fullPage: name === 'case' || name === 'zone-medals' });
    }
  }
  expect(errors).toEqual([]);
});

test('Study: the roadmap lists every line with its levels, and the acronyms can be drilled', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/study');
  await expect(page.getByRole('heading', { name: 'Study' })).toBeVisible();
  await expect(page.getByTestId('rm-item').first()).toBeVisible();
  await expect(page.getByText('Settimane 5–6 | Network vulnerability assessment')).toBeVisible();
  await page.getByRole('tab', { name: 'Acronyms' }).click();
  await expect(page.getByTestId('acronym-list')).toContainText('Common Vulnerabilities and Exposures');
  await expect(page.getByTestId('acronym-list')).toContainText('Known Exploited Vulnerabilities');
  await page.getByLabel('Search acronyms').fill('KEV');
  await expect(page.getByTestId('acronym-list').locator('dt').first()).toContainText('KEV');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByTestId('flashcard').click();
  await page.getByRole('button', { name: 'I knew it' }).click();
  await expect(page.getByText(/1 of \d+ marked as known/)).toBeVisible();
  await page.getByRole('button', { name: 'Quiz' }).click();
  for (let i = 0; i < 10; i++) {
    await page.locator('.quiz-opt').first().click();
    await page.getByRole('button', { name: /Next question|See the score/ }).click();
  }
  await expect(page.getByTestId('quiz-done')).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- Phone and offline ------------------------------------------------------------------------

test.describe('On a phone', () => {
  const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
  test.use(iphone);

  test('a level is played by tapping the commands in the steps, with nothing to type and no page zoom', async ({ page }) => {
    const errors = watchConsole(page);
    await seed(page, base);
    await page.goto('/play/net-subnet');
    // Every text box is at least 16px, so iOS does not zoom in on focus.
    for (const el of await page.locator('input, textarea').all()) {
      if (await el.isVisible()) expect(parseFloat(await el.evaluate((x) => getComputedStyle(x).fontSize))).toBeGreaterThanOrEqual(16);
    }
    const tap = async (code: string) => {
      const chip = page.locator('.step[data-state="current"] .step-do code.kbd[data-fill="1"]', { hasText: code }).first();
      await chip.tap();
      await expect(page.getByRole('textbox', { name: 'Command' })).toHaveValue(code);
      await page.getByRole('button', { name: 'Run', exact: true }).tap();
    };
    await tap('cat notes.txt');
    await tap('ipcalc 192.168.40.0/24');
    await tap('ipcalc 192.168.40.192/27');
    await expect(page.locator('.term')).toContainText('Hosts/Net: 30');
    await page.getByRole('textbox', { name: 'Command' }).fill('submit 30');
    await page.getByRole('button', { name: 'Run', exact: true }).tap();
    await tap('submit yes');
    await expect(page.getByRole('dialog')).toContainText(/cleared/, { timeout: 8000 });
    await noSideScroll(page, 'net-subnet on a phone');
    expect(errors).toEqual([]);
  });

  test('a capture filter is filled by a tap, and packet rows are big enough for a finger', async ({ page }) => {
    await seed(page, { ...base, zones: ['wire', 'capture'] });
    await page.goto('/play/pcap-filter');
    await page.locator('.step-do code.kbd[data-fill="1"]', { hasText: /^http$/ }).first().tap();
    await expect(page.getByLabel('Display filter')).toHaveValue('http');
    await page.getByRole('button', { name: 'Apply', exact: true }).tap();
    const row = await page.locator('.ws-table tbody tr').first().boundingBox();
    expect(row!.height).toBeGreaterThanOrEqual(36);
    await noSideScroll(page, 'pcap-filter on a phone');
  });
});

test('Installable and offline: a manifest, and after one visit the game loads and plays with no network', async ({ page, context }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'CyberMaster', display: 'standalone', start_url: '/' });
  expect((await page.request.get('/apple-touch-icon.png')).ok()).toBe(true);
  await seed(page, base);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.goto('/zones/capture');
  await expect(page.getByRole('heading', { name: 'The Capture', level: 1 })).toBeVisible();
  await page.goto('/play/net-subnet');
  const input = page.getByRole('textbox', { name: 'Command' });
  await input.fill('ipcalc 192.168.40.192/27');
  await input.press('Enter');
  await expect(page.locator('.term')).toContainText('HostMax:   192.168.40.222');
  await page.goto('/arcade/harden-up');
  await expect(page.locator('[data-start=true]')).toBeVisible();
  await context.setOffline(false);
});
