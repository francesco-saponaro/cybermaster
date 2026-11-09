import { describe, it, expect } from 'vitest';
import { run, JsError } from '../src/sim/js';
import { query, bind } from '../src/sim/sql';
import { escapeHtml, sanitizeHtml } from '../src/sim/html';
import { ARENA_APPS, MARK, runApp, testFix, listing, inputEscapedLiteral, describeInput, loginWithFilterEnv, USERS, type ArenaAppId } from '../src/sim/arena';
import { CLIENT_FIX } from '../src/content/levels/report';

describe('the code interpreter', () => {
  it('runs declarations, ifs, template strings and calls', () => {
    expect(run("const a = `x${n}y`; if (a.startsWith('x1')) return a + '!'; return 'no';", { n: 1 })).toEqual({ returned: true, value: 'x1y!' });
  });
  it('supports destructuring, spreads, optional chaining and regex', () => {
    const out = run("const { a, b } = o; const c = { ...o, b: 3 }; if (!/^\\d+$/.test(a)) return 'bad'; return [c.b, o?.zz?.q, b];", { o: { a: '12', b: 2 } });
    expect(out.value).toEqual([3, undefined, 2]);
  });
  it('reports a syntax error with a line number', () => {
    try {
      run('const x = ;\n', {});
      throw new Error('unreachable');
    } catch (e) {
      expect(e).toBeInstanceOf(JsError);
      expect((e as JsError).line).toBe(1);
    }
  });
  it('refuses prototype access and loops', () => {
    expect(() => run('return o.constructor;', { o: {} })).toThrow(JsError);
    expect(() => run('while (true) {}', {})).toThrow(JsError);
    expect(() => run('return missing;', {})).toThrow(/not defined/);
  });
});

describe('the SQL engine', () => {
  it('filters rows with AND, OR and comparisons, AND binding tighter', () => {
    expect(query("SELECT * FROM users WHERE name = 'alice' AND pass = 'tulip-river-42'", { users: USERS }).rows.length).toBe(1);
    expect(query("SELECT * FROM users WHERE role = 'customer' OR id = 1", { users: USERS }).rows.length).toBe(3);
    expect(query("SELECT * FROM users WHERE name = 'nobody' OR id > 0 AND role = 'none'", { users: USERS }).rows.length).toBe(0);
  });
  it('reports a syntax error for an unbalanced string', () => {
    const r = query("SELECT * FROM users WHERE name = 'O'Brien'", { users: USERS });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/SQL syntax/);
  });
  it('binds ?, $1 and :name parameters as escaped literals', () => {
    expect(bind('WHERE a = ?', ["O'Brien"]).sql).toBe("WHERE a = 'O''Brien'");
    expect(bind('WHERE a = $2 AND b = $1', ['p', 'q']).sql).toBe("WHERE a = 'q' AND b = 'p'");
    expect(bind('WHERE a = :name', { name: 'sam' }).sql).toBe("WHERE a = 'sam'");
    expect(bind('WHERE a = ?', undefined).error).toBeTruthy();
  });
  it('tells input that stayed a value from input that became query structure', () => {
    expect(inputEscapedLiteral(`WHERE name = '${MARK.sqlBreakout}'`)).toBe(true);
    expect(inputEscapedLiteral(bind('WHERE name = ?', [MARK.sqlBreakout]).sql)).toBe(false);
  });
});

describe('HTML helpers', () => {
  it('escape and sanitise without passing unknown tags through', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jo'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jo&#39;&lt;/b&gt;');
    expect(sanitizeHtml(`<b>ok</b>${MARK.markup}`)).toBe('<b>ok</b>');
  });
});

describe('the Arena apps', () => {
  const ids = Object.keys(ARENA_APPS) as ArenaAppId[];
  for (const id of ids) {
    const app = ARENA_APPS[id];
    it(`${id}: the recorded attack harms the original code`, () => {
      const r = runApp(id, app.code.edit, app.attack);
      expect(r.error).toBeUndefined();
      expect(r.harmed).toBe(true);
    });
    it(`${id}: the reference fix passes replay, variants and normal use`, () => {
      expect(testFix(id, app.code.fix)).toMatchObject({ attackBlocked: true, variantsBlocked: true, normalWorks: true, reason: '' });
    });
    it(`${id}: the original code fails the replay`, () => {
      expect(testFix(id, app.code.edit).attackBlocked).toBe(false);
    });
    it(`${id}: the faulty line is inside the editable region`, () => {
      const l = listing(app, app.code.edit);
      expect(l.lines[l.fault - 1]?.region).toBe('edit');
    });
  }

  it('describes hostile input in plain words and never shows the marker', () => {
    expect(describeInput(MARK.sqlComment)).toMatch(/comments out the password check/);
    const r = runApp('login', ARENA_APPS.login.code.edit, ARENA_APPS.login.attack);
    expect(r.log.join('\n')).not.toContain('⟦');
  });

  it('login: accepts several correct ways of writing the fix', () => {
    const forms = [
      "  const rows = db.query('SELECT * FROM users WHERE name = ? AND pass = ?', [name, pass]);",
      "  const rows = db.query('SELECT * FROM users WHERE name = $1 AND pass = $2', [name, pass]);",
      "  const rows = db.query('SELECT * FROM users WHERE name = :name AND pass = :pass', { name, pass });",
      '  const sql = `SELECT * FROM users WHERE name = ? AND pass = ?`;\n  const params = [name, pass];\n  const rows = db.query(sql, params);',
    ];
    for (const f of forms) expect(testFix('login', f).reason).toBe('');
  });
  it('login: rejects wrong fixes, with a reason', () => {
    const swapped = testFix('login', "  const rows = db.query('SELECT * FROM users WHERE name = ? AND pass = ?', [pass, name]);");
    expect(swapped).toMatchObject({ attackBlocked: true, normalWorks: false });
    expect(testFix('login', '  const rows = db.query(`SELECT * FROM users WHERE name = \'${name}\' AND pass = \'${pass}\'`);').attackBlocked).toBe(false);
    expect(testFix('login', "  const rows = db.query('SELECT', [name, pass]").error).toMatch(/line 1 of your code/);
  });
  it('search: escapeHtml, he.encode and DOMPurify pass; trimming one tag name does not', () => {
    expect(testFix('search', "  const safe = he.encode(q);\n  return res.send(`<h2>Results for ${safe}</h2>${list(hits)}`);").reason).toBe('');
    expect(testFix('search', "  return res.send('<h2>Results for ' + q.replace(/<script>/g, '') + '</h2>' + list(hits));").attackBlocked).toBe(false);
  });
  it('invoices: 403 or 404, either if shape; a lockout or the wrong field fails normal use', () => {
    expect(testFix('invoices', "  if (!invoice) return res.status(404).end();\n  if (invoice.ownerId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });\n  return res.json(invoice);").reason).toBe('');
    expect(testFix('invoices', '  if (invoice && invoice.ownerId === req.user.id) return res.json(invoice);\n  return res.sendStatus(404);').reason).toBe('');
    expect(testFix('invoices', '  return res.status(403).end();')).toMatchObject({ attackBlocked: true, normalWorks: false });
    expect(testFix('invoices', '  if (!invoice || invoice.ownerId !== req.user.name) return res.status(404).end();\n  return res.json(invoice);').normalWorks).toBe(false);
  });
  it('ping: execFile or an address allow-list fix it; a blocklist of one character does not', () => {
    expect(testFix('ping', "  if (!/^\\d{1,3}(\\.\\d{1,3}){3}$/.test(host)) return res.status(400).send('Bad host');\n  return res.send(exec('ping -c 1 ' + host));").reason).toBe('');
    expect(testFix('ping', "  if (host.includes(';')) return res.status(400).send('no');\n  return res.send(exec('ping -c 1 ' + host));").attackBlocked).toBe(false);
  });
  it('preview: an allow-list passes; blocking one address misses the variants', () => {
    const block = testFix('preview', "  if (target.hostname === '169.254.169.254') return res.status(400).end();\n  return res.json(preview(fetchPage(target.href)));");
    expect(block).toMatchObject({ attackBlocked: true, variantsBlocked: false });
    expect(testFix('preview', '  if (ALLOWED_HOSTS.indexOf(target.hostname) === -1) return res.sendStatus(400);\n  return res.json(preview(fetchPage(target.href)));').reason).toBe('');
  });
  it('signup: picking fields passes; pinning only the role misses the variants', () => {
    expect(testFix('signup', '  const user = db.users.create({ name: req.body.name, email: req.body.email });\n  return res.status(201).json(user);').reason).toBe('');
    expect(testFix('signup', "  return res.status(201).json(db.users.create(pick(req.body, ['name', 'email'])));").reason).toBe('');
    expect(testFix('signup', "  const user = db.users.create({ ...req.body, role: 'customer' });\n  return res.status(201).json(user);")).toMatchObject({ attackBlocked: true, variantsBlocked: false });
  });
  it("retest: the developers' filter stops the recorded attack but not its variant", () => {
    const app = ARENA_APPS.login;
    const original = runApp('login', CLIENT_FIX, app.attack, loginWithFilterEnv);
    expect(original.status).toBe(400);
    expect(runApp('login', CLIENT_FIX, app.variants[0]!, loginWithFilterEnv).harmed).toBe(true);
  });
});
