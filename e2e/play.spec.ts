import { test, expect, type Page, type Locator } from '@playwright/test';

// Every level of every zone is played the way a beginner would: by reading the
// current step and doing what it says. Values to type, buttons to press and
// lines to click are read from the step text on screen (its `code` spans and
// its example block), so a pass shows the guidance alone is enough to clear
// the level. Show me is never used. Any console error fails the run.

const SAVE_KEY = 'cybermaster.save';
const OPEN_ALL = { version: 4, name: '', xp: 0, levels: {}, codex: [], badges: [], streak: { count: 0, lastDay: '' }, settings: { muted: true }, evidence: [], zones: ['arena', 'perimeter', 'cloud', 'report'] };

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function seed(page: Page, save: object = OPEN_ALL) {
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(save)] as const);
}

async function cleared(page: Page) {
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('dialog')).toContainText(/cleared/);
}

/** A boss runs as a live incident: the attacker's track is on screen while you work, and contained once you win. */
async function incidentRunning(page: Page) {
  await expect(page.getByRole('region', { name: 'Live incident' })).toHaveAttribute('data-status', 'running');
}
async function bossCleared(page: Page) {
  await cleared(page);
  await expect(page.getByRole('region', { name: 'Live incident' })).toHaveAttribute('data-status', 'contained');
}

// ---- Reading the steps -------------------------------------------------------

const stepEl = (page: Page, id: string) => page.locator(`.lv-aside .step[data-check="${id}"]`);

/** Wait until `id` is the current step, and return what it says to do. */
async function step(page: Page, id: string): Promise<{ codes: string[]; text: string; hint: string; el: Locator }> {
  const el = stepEl(page, id);
  await expect(el, `step ${id} should be current`).toHaveAttribute('data-state', 'current');
  return read(el);
}

async function read(el: Locator) {
  const doEl = el.locator('.step-do').first();
  await expect(doEl).toBeVisible();
  const codes = await doEl.locator('.kbd').allTextContents();
  // The step's words with each code span put back in backticks, as it was written.
  const text = await doEl.locator('p').first().evaluate((p) => Array.from(p.childNodes).map((n) => (n instanceof HTMLElement && n.tagName === 'CODE' ? `\`${n.textContent}\`` : n.textContent)).join(''));
  const hint = (await doEl.locator('.step-hint').count()) ? ((await doEl.locator('.step-hint').textContent()) ?? '') : '';
  return { codes, text, hint, el };
}

async function done(page: Page, id: string) {
  await expect(stepEl(page, id)).toHaveAttribute('data-state', 'done');
  await expect(stepEl(page, id).locator('.step-learned')).toBeVisible();
}

const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

// ---- The Wire -------------------------------------------------------------------

const req = (page: Page) => page.getByLabel('Raw HTTP request');
async function editRequest(page: Page, fn: (s: string) => string) {
  const t = req(page);
  await t.fill(fn(await t.inputValue()));
}
async function editHeld(page: Page, fn: (s: string) => string) {
  const t = page.getByLabel('Held response headers');
  await t.fill(fn(await t.inputValue()));
}
async function consoleRun(page: Page, line: string) {
  await page.getByLabel('Browser console').fill(line);
  await page.getByLabel('Browser console').press('Enter');
}
const appendToLine = (s: string, start: string, add: string) => s.split('\n').map((l) => (l.startsWith(start) ? l + add : l)).join('\n');

test('The Wire: all six levels, from the steps', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, { ...OPEN_ALL, zones: [] });

  await page.goto('/play/wire-robots');
  await expect(page.getByRole('note', { name: 'Where to start' })).toContainText('Send');
  let s = await step(page, 'sent');
  await btn(page, s.codes[0]!).click();
  await expect(page.getByRole('note', { name: 'Where to start' })).toHaveCount(0);
  s = await step(page, 'robots');
  await editRequest(page, (r) => r.replace(s.codes[0]!, s.codes[1]!));
  await btn(page, 'Send').click();
  s = await step(page, 'hidden');
  await page.getByLabel('Address bar path').fill(s.codes[0]!);
  await page.getByLabel('Address bar path').press('Enter');
  await cleared(page);

  await page.goto('/play/wire-cookie-role');
  s = await step(page, 'sent');
  await btn(page, s.codes[0]!).click();
  s = await step(page, 'admin');
  await editRequest(page, (r) => r.replace(s.codes[1]!, s.codes[2]!));
  await btn(page, 'Send').click();
  await cleared(page);

  await page.goto('/play/wire-replay');
  s = await step(page, 'mine');
  await btn(page, s.codes[0]!).click();
  s = await step(page, 'mara');
  await page.locator('li', { hasText: s.codes[1]! }).getByRole('button', { name: s.codes[0]! }).click();
  await btn(page, 'Send').click();
  await cleared(page);

  await page.goto('/play/wire-httponly');
  s = await step(page, 'read');
  await btn(page, s.codes[0]!).click();
  await btn(page, s.codes[1]!).click();
  await consoleRun(page, s.codes[2]!);
  s = await step(page, 'flag');
  await btn(page, s.codes[0]!).click();
  await editHeld(page, (r) => appendToLine(r, s.codes[2]!, s.codes[1]!));
  await btn(page, s.codes[3]!).click();
  s = await step(page, 'hidden');
  await consoleRun(page, s.codes[0]!);
  await cleared(page);

  await page.goto('/play/wire-jwt');
  s = await step(page, 'tampered');
  await editRequest(page, (r) => r.replace(s.codes[0]!, s.codes[1]!));
  const payload = page.getByLabel('Payload');
  await payload.fill((await payload.inputValue()).replace(s.codes[2]!, s.codes[3]!));
  await btn(page, 'Send').click();
  s = await step(page, 'v1');
  await page.getByLabel('Header').fill(s.codes[0]!);
  await page.getByLabel('Signature').fill('');
  await btn(page, 'Send').click();
  s = await step(page, 'v2');
  await editRequest(page, (r) => r.replace(s.codes[0]!, s.codes[1]!));
  await btn(page, 'Send').click();
  await cleared(page);

  await page.goto('/play/wire-cors');
  await incidentRunning(page);
  s = await step(page, 'evil');
  await btn(page, 'Send').click();
  await btn(page, 'Forward').click();
  await expect(page.locator('.mb-page')).toContainText('Read it all');
  await btn(page, 'Send').click();
  await editHeld(page, (r) => r.replace(s.codes[4]!, s.codes[5]!));
  await btn(page, 'Forward').click();
  await done(page, 'bank');
  s = await step(page, 'cookie');
  await btn(page, 'Send').click();
  await expect(page.getByLabel('Held response headers')).toHaveValue(/bank\.example/);
  await editHeld(page, (r) => appendToLine(r, s.codes[1]!, s.codes[2]!));
  await btn(page, 'Forward').click();
  s = await step(page, 'hsts');
  await btn(page, 'Send').click();
  await editHeld(page, (r) => `${r.trimEnd()}\n${s.codes[1]!}`);
  await btn(page, 'Forward').click();
  await bossCleared(page);
  expect(errors).toEqual([]);
});

// ---- The Arena ------------------------------------------------------------------

test('The Arena: all six levels, from the steps', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page);
  for (const id of ['arena-sqli', 'arena-xss', 'arena-idor', 'arena-cmdi', 'arena-ssrf', 'arena-mass']) {
    await page.goto(`/play/${id}`);
    if (id === 'arena-mass') await incidentRunning(page);
    let s = await step(page, 'found');
    await btn(page, 'Play the recorded attack').click();
    await expect(page.locator('.replay-steps li[data-harm="true"]')).toBeVisible();
    const line = /line (\d+)/.exec(s.text)?.[1];
    expect(line, `${id}: the first step names a line`).toBeTruthy();
    // The step quotes the line it means: it must be the line with that number.
    const quoted = s.codes.find((c) => c !== 'Play the recorded attack')!;
    const target = page.getByRole('button', { name: new RegExp(`^Line ${line}:`) });
    await expect(target).toContainText(quoted.replace(/^\+ | \+$/g, '').trim());
    await target.click();
    s = await step(page, 'blocked');
    expect(s.hint, `${id}: step 2 shows the shape of the fix`).toBeTruthy();
    await page.getByLabel('Your fix (editable)').fill(s.hint);
    await btn(page, 'Replay attack').click();
    if (id === 'arena-mass') await bossCleared(page);
    else await cleared(page);
  }
  expect(errors).toEqual([]);
});

// ---- The Perimeter ----------------------------------------------------------------

async function terminal(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: 'Command' });
  await expect(input).toBeEnabled();
  await input.fill(line);
  await input.press('Enter');
  await expect(input).toBeEnabled({ timeout: 8000 });
}

const COMMAND = /^(nmap|cat|dig|whois|curl|vulndb|nc|submit) \S/;

/** What a bare "submit" step asks for, read off the terminal as the step tells you to. */
function answerFromTerminal(out: string, stepText: string): string {
  if (/hosts are up|hosts up/.test(stepText)) return /(\d+) hosts? up/.exec(out)![1]!;
  if (/5432/.test(stepText)) {
    let host = '';
    for (const l of out.split('\n')) {
      const m = /Nmap scan report for (?:\S+ \()?([\d.]+)/.exec(l);
      if (m) host = m[1]!;
      if (l.startsWith('5432/tcp') && /open/.test(l)) return host;
    }
  }
  const cves = out.match(/CVE-\d{4}-\d+/g) ?? [];
  return cves[cves.length - 1]!;
}

test('The Perimeter: all six levels, from the steps', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page);
  const levels: Record<string, string[]> = {
    'perimeter-sweep': ['sweep', 'answer'],
    'perimeter-ports': ['scan', 'answer'],
    'perimeter-versions': ['version', 'lookup', 'answer'],
    'perimeter-false-positive': ['report', 'banner', 'answer'],
    'perimeter-scope': ['dig', 'whois', 'answer'],
    'perimeter-boss': ['survey', 'verify', 'answer'],
  };
  for (const [id, steps] of Object.entries(levels)) {
    await page.goto(`/play/${id}`);
    if (id === 'perimeter-boss') await incidentRunning(page);
    for (const sid of steps) {
      const s = await step(page, sid);
      const commands = s.codes.filter((c) => COMMAND.test(c));
      // Run every command the step names; of two submit choices, the first is the one its condition picks here.
      const runs = commands.filter((c) => !c.startsWith('submit'));
      for (const c of runs) await terminal(page, c);
      const submit = commands.find((c) => c.startsWith('submit'));
      if (submit) await terminal(page, submit);
      else if (s.codes.includes('submit')) await terminal(page, `submit ${answerFromTerminal(await page.locator('.term').innerText(), s.text)}`);
      if (sid !== steps[steps.length - 1]) await done(page, sid);
    }
    if (id === 'perimeter-boss') await bossCleared(page);
    else await cleared(page);
  }
  expect(errors).toEqual([]);
});

// ---- The Cloud ------------------------------------------------------------------

async function sgRow(page: Page, ports: string): Promise<Locator> {
  const rows = page.locator('.sg-row');
  for (let i = 0; i < (await rows.count()); i++) {
    if ((await rows.nth(i).getByLabel(/^Ports for/).inputValue()) === ports) return rows.nth(i);
  }
  throw new Error(`no rule for ${ports}`);
}

async function editJson(field: Locator, fn: (doc: { routes: Record<string, unknown>[] }) => void) {
  const doc = JSON.parse(await field.inputValue());
  fn(doc);
  await field.fill(JSON.stringify(doc, null, 2));
}

test('The Cloud: all six levels, from the steps', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page);

  await page.goto('/play/cloud-bucket');
  let s = await step(page, 'no-public');
  await page.getByLabel('Bucket policy JSON').fill(s.hint);
  s = await step(page, 'bpa');
  await page.getByRole('switch', { name: s.codes[0]! }).click();
  await cleared(page);

  await page.goto('/play/cloud-iam');
  s = await step(page, 'no-star-action');
  await page.getByLabel('IAM policy JSON').fill(s.hint);
  await cleared(page);

  await page.goto('/play/cloud-sg');
  s = await step(page, 'ssh');
  await (await sgRow(page, s.codes[0]!)).getByLabel(/^Source for/).fill(s.codes[2]!);
  for (const sid of ['rdp', 'db']) {
    s = await step(page, sid);
    await (await sgRow(page, s.codes[1]!)).getByRole('button', { name: /^Remove/ }).click();
  }
  await cleared(page);

  await page.goto('/play/cloud-keys');
  s = await step(page, 'found');
  await page.getByRole('button', { name: new RegExp(s.codes[0]!) }).click();
  s = await step(page, 'deploys');
  await btn(page, s.codes[0]!).click();
  await page.getByLabel(s.codes[2]!).selectOption(s.codes[1]!);
  s = await step(page, 'revoked');
  await page.locator('li', { hasText: s.codes[1]! }).getByRole('button', { name: s.codes[0]! }).click();
  await cleared(page);

  await page.goto('/play/cloud-scan');
  for (const [sid, verdict] of [['real', 'Send to fix'], ['noise', 'Dismiss as false alarm']] as const) {
    s = await step(page, sid);
    expect(s.codes).toContain(verdict);
    for (const alert of s.codes.filter((c) => /^[a-z]+(-[a-z]+)+$/.test(c))) {
      await page.getByRole('button', { name: new RegExp(alert) }).click();
      await btn(page, 'Trace').click();
      await btn(page, verdict).click();
    }
  }
  await cleared(page);

  await page.goto('/play/cloud-gateway');
  await incidentRunning(page);
  const config = page.getByLabel('Gateway config JSON');
  s = await step(page, 'export');
  await page.getByRole('combobox').selectOption({ label: s.codes[0]! });
  await btn(page, s.codes[1]!).click();
  await btn(page, s.codes[2]!).click();
  await expect(page.locator('.status').filter({ hasText: /^200$/ })).toBeVisible();
  const route = (doc: { routes: Record<string, unknown>[] }, path: string) => doc.routes.find((r) => r.path === path)!;
  const pair = (code: string) => JSON.parse(`{${code}}`) as Record<string, unknown>;
  await editJson(config, (d) => Object.assign(route(d, '/internal/export'), pair(s.codes[4]!)));
  s = await step(page, 'bola');
  await editJson(config, (d) => Object.assign(route(d, s.codes[0]!), pair(s.codes[2]!)));
  s = await step(page, 'ratelimit');
  await editJson(config, (d) => Object.assign(route(d, s.codes[0]!), pair(s.codes[1]!)));
  await bossCleared(page);
  expect(errors).toEqual([]);
});

// ---- The Report -----------------------------------------------------------------

/** "click `Network` for Attack vector, `Low` for Attack complexity, ...": press each. */
async function setMetrics(page: Page, text: string) {
  for (const m of text.matchAll(/`([^`]+)` for (Attack vector|Attack complexity|Privileges required|User interaction|Scope|Confidentiality|Integrity|Availability)/g)) {
    await page.getByRole('group', { name: m[2]! }).getByRole('button', { name: m[1]!, exact: true }).click();
  }
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

test('The Report: all five levels, from the steps', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page);

  await page.goto('/play/report-phases');
  await page.getByRole('button', { name: /nmap -sV of the range/ }).click();
  await page.getByRole('button', { name: /Scope and authorisation/ }).click();
  await expect(page.getByRole('alert')).toContainText(/Try a later phase/);
  let s = await step(page, 'scope-first');
  await page.getByRole('button', { name: new RegExp(esc(s.codes[0]!)) }).click();
  await page.getByRole('button', { name: new RegExp(esc(s.codes[1]!)) }).click();
  s = await step(page, 'order');
  for (let i = 0; i < s.codes.length; i += 2) {
    await page.getByRole('button', { name: new RegExp(esc(s.codes[i]!)) }).click();
    await page.getByRole('button', { name: new RegExp(esc(s.codes[i + 1]!)) }).click();
  }
  await cleared(page);

  await page.goto('/play/report-cvss');
  s = await step(page, 'exploitability');
  await setMetrics(page, s.text);
  s = await step(page, 'impact');
  await setMetrics(page, s.text);
  await expect(page.locator('.cvss-score')).toContainText('6.5');
  await cleared(page);

  await page.goto('/play/report-finding');
  for (const field of ['title', 'asset', 'description', 'impact', 'fix']) {
    const r = await read(stepEl(page, field));
    await page.getByLabel(r.codes[0]!, { exact: true }).fill(r.codes[1]!);
  }
  await setMetrics(page, (await read(stepEl(page, 'severity'))).text);
  const ev = await read(stepEl(page, 'evidence'));
  for (const title of ev.codes.slice(1)) await page.locator('li', { hasText: title }).getByRole('button', { name: ev.codes[0]! }).click();
  const fix = await read(stepEl(page, 'fix'));
  await btn(page, fix.codes[2]!).click();
  await cleared(page);

  await page.goto('/play/report-retest');
  s = await step(page, 'replayed');
  await page.getByRole('button', { name: new RegExp(`^${esc(s.codes[0]!)}`) }).click();
  s = await step(page, 'bypass');
  await btn(page, s.codes[0]!).click();
  s = await step(page, 'verdict');
  await page.getByRole('group', { name: 'Finding status' }).getByRole('button', { name: s.codes[1]! }).click();
  await cleared(page);

  await page.goto('/play/report-lab');
  await incidentRunning(page);
  const compose = page.getByLabel('Compose file');
  s = await step(page, 'local');
  await compose.fill((await compose.inputValue()).replace(s.codes[1]!, s.codes[2]!));
  s = await step(page, 'target');
  await compose.fill((await compose.inputValue()).replace(s.codes[1]!, s.codes[2]!));
  s = await step(page, 'network');
  await compose.fill(s.hint);
  s = await step(page, 'run');
  await btn(page, s.codes[0]!).click();
  await bossCleared(page);
  // The last boss of the game closes the case.
  await page.getByRole('link', { name: 'Close the case' }).click();
  await expect(page.getByRole('heading', { name: 'The Lantern & Co. case' })).toBeVisible();
  expect(errors).toEqual([]);
});

// ---- Phone width ------------------------------------------------------------------

async function noSideScroll(page: Page, what: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${what} scrolls sideways`).toBeLessThanOrEqual(0);
}

test('Phone: a first level played through the tabs, with the step bar in sight', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 667 });
  await seed(page, { ...OPEN_ALL, zones: [] });
  await page.goto('/play/wire-robots');
  // The tab that holds the first control is marked.
  await expect(page.getByRole('tab', { name: /Request/ })).toContainText('Start here');
  await page.getByRole('tab', { name: /Request/ }).click();
  await expect(page.getByRole('note', { name: 'Where to start' })).toBeVisible();
  await noSideScroll(page, 'wire-robots');
  // Scrolled down to the sandbox, the current step stays in a bar at the top.
  await page.getByRole('tab', { name: /Request/ }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const bar = page.locator('.stepbar');
  await expect(bar).toHaveAttribute('data-visible', 'true');
  await expect(bar).toContainText('Step 1 of 3');
  await bar.getByRole('button').click();
  await expect(bar.locator('.step-do')).toContainText('Send');
  await btn(page, 'Send').click();
  await expect(bar).toContainText('Step 2 of 3');
  await noSideScroll(page, 'wire-robots with the bar open');
  expect(errors).toEqual([]);
});

test('Phone and desktop: one level per zone, nothing wider than the screen', async ({ page }) => {
  const errors = watchConsole(page);
  const allCleared = Object.fromEntries(
    ['wire-robots', 'wire-cookie-role', 'wire-replay', 'wire-httponly', 'arena-sqli', 'perimeter-sweep', 'cloud-bucket', 'cloud-iam', 'report-phases', 'report-cvss'].map((id) => [id, { stars: 2, clears: 1, bestSeconds: 75, lastPlayedAt: '' }]),
  );
  await seed(page, { ...OPEN_ALL, xp: 640, levels: allCleared });
  const pages = ['/', '/zones/wire', '/play/wire-robots', '/play/wire-jwt', '/play/arena-sqli', '/play/perimeter-sweep', '/play/cloud-sg', '/play/report-finding', '/codex', '/profile'];
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const p of pages) {
      await page.goto(p);
      await page.waitForTimeout(300);
      await noSideScroll(page, `${p} at ${width}`);
      await page.screenshot({ path: `test-results/w${width}${p.replace(/\//g, '_') || '_home'}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);
});

test('Laptop screen: the proxy Forward button is in sight without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const done = { stars: 2, clears: 1, bestSeconds: 75, lastPlayedAt: '' };
  await seed(page, { ...OPEN_ALL, levels: { 'wire-robots': done, 'wire-cookie-role': done, 'wire-replay': done } });
  await page.goto('/play/wire-httponly');
  await page.getByRole('button', { name: 'Send', exact: true }).first().click();
  const forward = page.getByRole('button', { name: 'Forward' });
  await expect(forward).toBeInViewport();
  const box = await forward.boundingBox();
  expect(box && box.y + box.height).toBeLessThanOrEqual(720);
});

test('A level lists and explains its technical words, and underlined words explain themselves', async ({ page }) => {
  const done = { stars: 2, clears: 1, bestSeconds: 75, lastPlayedAt: '' };
  await seed(page, { ...OPEN_ALL, levels: { 'wire-robots': done, 'wire-cookie-role': done, 'wire-replay': done, 'wire-httponly': done } });
  await page.goto('/play/wire-jwt');
  const words = page.getByTestId('level-words');
  await expect(words).toHaveAttribute('open', '');
  for (const w of ['JWT', 'alg', 'HS256', 'Payload', 'Signature']) await expect(words.locator('dt', { hasText: new RegExp(`^${w}`) }).first()).toBeVisible();
  const gloss = page.locator('.brief-say .gloss-link').first();
  await gloss.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tooltip')).toBeVisible();
});
