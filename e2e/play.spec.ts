import { test, expect, type Page } from '@playwright/test';

// Each level is solved the way a player would: typing into the sandbox and
// clicking its controls. Show me is not used. Any console error fails the run.

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

async function seed(page: Page, save: object = { ...OPEN_ALL, zones: [] }) {
  await page.goto('/');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(save)] as const);
}

async function cleared(page: Page) {
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('dialog')).toContainText(/cleared/);
}

const req = (page: Page) => page.getByLabel('Raw HTTP request');
const send = (page: Page) => page.getByRole('button', { name: 'Send', exact: true }).click();

async function editRequest(page: Page, fn: (s: string) => string) {
  const t = req(page);
  await t.fill(fn(await t.inputValue()));
}

test('The Wire: every level, played through', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page);

  await page.goto('/play/wire-robots');
  await send(page);
  await editRequest(page, (s) => s.replace('GET / ', 'GET /robots.txt '));
  await send(page);
  await expect(page.locator('.mb-page')).toContainText('/staff-notes');
  await page.getByLabel('Address bar path').fill('/staff-notes');
  await page.getByLabel('Address bar path').press('Enter');
  await cleared(page);

  await page.goto('/play/wire-cookie-role');
  await send(page);
  await editRequest(page, (s) => s.replace('role=user', 'role=admin'));
  await send(page);
  await expect(page.locator('.mb-page')).toContainText('Admin panel');
  await cleared(page);

  await page.goto('/play/wire-replay');
  await send(page);
  await page.getByRole('button', { name: 'Load' }).nth(1).click();
  await send(page);
  await expect(page.locator('.mb-page')).toContainText('Hello, Mara');
  await cleared(page);

  await page.goto('/play/wire-httponly');
  await send(page);
  await page.getByRole('button', { name: 'Forward' }).click();
  await page.getByLabel('Browser console').fill('document.cookie');
  await page.getByLabel('Browser console').press('Enter');
  await send(page);
  const held = page.getByLabel('Held response headers');
  await held.fill((await held.inputValue()).replace('Path=/', 'Path=/; HttpOnly'));
  await page.getByRole('button', { name: 'Forward' }).click();
  await page.getByLabel('Browser console').fill('document.cookie');
  await page.getByLabel('Browser console').press('Enter');
  await cleared(page);

  await page.goto('/play/wire-jwt');
  await editRequest(page, (s) => s.replace('/v1/me', '/v1/admin'));
  await page.getByLabel('Payload').fill('{"sub":"sam","role":"admin","iat":1793952000}');
  await send(page);
  await expect(page.locator('.mb-page')).toContainText('Invalid signature');
  await page.getByLabel('Header').fill('{"alg":"none","typ":"JWT"}');
  await page.getByLabel('Signature').fill('');
  await send(page);
  await editRequest(page, (s) => s.replace('/v1/admin', '/v2/admin'));
  await send(page);
  await cleared(page);

  await page.goto('/play/wire-cors');
  await send(page);
  await page.getByRole('button', { name: 'Forward' }).click();
  await expect(page.locator('.mb-page')).toContainText('Read it all');
  await send(page);
  const h = page.getByLabel('Held response headers');
  await h.fill(
    (await h.inputValue())
      .replace('{origin}', 'https://bank.example')
      .replace('Path=/', 'Path=/; HttpOnly; Secure; SameSite=Lax') + '\nStrict-Transport-Security: max-age=31536000',
  );
  await page.getByRole('button', { name: 'Forward' }).click();
  await cleared(page);
  expect(errors).toEqual([]);
});

async function arenaLevel(page: Page, id: string, faultLine: number, fix: string) {
  await page.goto(`/play/${id}`);
  await page.getByRole('button', { name: 'Play the recorded attack' }).click();
  await expect(page.locator('.replay-steps li[data-harm="true"]')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^Line ${faultLine}:`) }).click();
  await page.getByLabel('Your fix (editable)').fill(fix);
  await page.getByRole('button', { name: 'Replay attack' }).click();
  await cleared(page);
}

test('The Arena: two levels, find the line, fix it, replay', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, OPEN_ALL);
  await arenaLevel(page, 'arena-sqli', 3, "  const rows = db.query('SELECT * FROM users WHERE name = ? AND pass = ?', [name, pass]);");
  await arenaLevel(page, 'arena-xss', 4, "  return res.send('<h2>Results for ' + escapeHtml(q) + '</h2>' + list(hits));");
  expect(errors).toEqual([]);
});

async function terminal(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: 'Command' });
  await expect(input).toBeEnabled();
  await input.fill(line);
  await input.press('Enter');
}

test('The Perimeter: two levels at the terminal', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, OPEN_ALL);
  await page.goto('/play/perimeter-sweep');
  await terminal(page, 'nmap -sn 10.0.8.0/24');
  await expect(page.locator('.term')).toContainText('5 hosts up');
  await terminal(page, 'submit 256');
  await expect(page.locator('.term')).toContainText('Rejected');
  await terminal(page, 'submit 5');
  await cleared(page);

  await page.goto('/play/perimeter-ports');
  const input = page.getByRole('textbox', { name: 'Command' });
  await input.fill('nmap 10.0.8.4');
  await input.press('Tab');
  await expect(input).toHaveValue('nmap 10.0.8.40 ');
  await input.press('Enter');
  await expect(page.locator('.term')).toContainText('5432/tcp');
  await terminal(page, 'submit 10.0.8.40');
  await cleared(page);
  expect(errors).toEqual([]);
});

test('The Cloud: two levels in the console', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, OPEN_ALL);
  await page.goto('/play/cloud-bucket');
  const policy = page.getByLabel('Bucket policy JSON');
  const doc = JSON.parse(await policy.inputValue());
  doc.Statement = doc.Statement.filter((s: { Sid: string }) => s.Sid !== 'PublicRead');
  await policy.fill(JSON.stringify(doc, null, 2));
  await page.getByRole('switch', { name: 'Block all public access' }).click();
  await cleared(page);

  await page.goto('/play/cloud-iam');
  await page.getByLabel('IAM policy JSON').fill('{ "Statement": [ { "Effect": "Allow", "Action": "s3:*", "Resource": "*" } ] }');
  await expect(page.locator('[data-check="no-star-action"]')).toHaveAttribute('data-pass', 'false');
  await page.getByLabel('IAM policy JSON').fill(
    JSON.stringify({ Version: '2012-10-17', Statement: [
      { Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-reports/monthly/*' },
      { Effect: 'Allow', Action: 's3:PutObject', Resource: 'arn:aws:s3:::harbor-reports/exports/*' },
    ] }, null, 2),
  );
  await cleared(page);
  expect(errors).toEqual([]);
});

test('The Report: two levels at the desk', async ({ page }) => {
  const errors = watchConsole(page);
  await seed(page, OPEN_ALL);
  await page.goto('/play/report-phases');
  await page.getByRole('button', { name: /nmap -sV of the range/ }).click();
  await page.getByRole('button', { name: /Scope and authorisation/ }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const order = ['Signed scope', 'nmap -sV of the range', 'Scanner report', 'Login bypass, proven', 'Finding: SQL injection', 'Retest note'];
  const phases = ['Scope and authorisation', 'Reconnaissance', 'Vulnerability assessment', 'Validation', 'Risk and report', 'Remediation and retest'];
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: new RegExp(order[i]!.replace(/[-.]/g, '\\$&')) }).click();
    await page.getByRole('button', { name: new RegExp(phases[i]!) }).click();
  }
  await cleared(page);

  await page.goto('/play/report-cvss');
  const pick = (group: string, value: string) => page.getByRole('group', { name: group }).getByRole('button', { name: value, exact: true }).click();
  await pick('Attack vector', 'Network');
  await pick('Attack complexity', 'Low');
  await pick('Privileges required', 'Low');
  await pick('User interaction', 'None');
  await pick('Confidentiality', 'High');
  await expect(page.locator('.cvss-score')).toContainText('6.5');
  await cleared(page);
  expect(errors).toEqual([]);
});

test('Phone width: title, zone map and one level per zone, nothing wider than the screen', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const allCleared = Object.fromEntries(
    ['wire-robots', 'wire-cookie-role', 'wire-replay', 'wire-httponly', 'arena-sqli', 'perimeter-sweep', 'cloud-bucket', 'cloud-iam', 'report-phases'].map((id) => [id, { stars: 2, clears: 1, bestSeconds: 75, lastPlayedAt: '' }]),
  );
  await seed(page, { ...OPEN_ALL, xp: 640, levels: allCleared });
  const pages = ['/', '/zones/wire', '/play/wire-jwt', '/play/arena-sqli', '/play/perimeter-sweep', '/play/cloud-sg', '/play/report-cvss', '/codex', '/profile'];
  for (const p of pages) {
    await page.goto(p);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${p} scrolls sideways`).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `test-results/phone${p.replace(/\//g, '_') || '_home'}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
