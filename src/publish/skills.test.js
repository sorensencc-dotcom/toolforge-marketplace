import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SPEC_CATEGORIES, buildSkillRows, createSkills, loadSkillRows } from './skills.js';

const root = resolve(import.meta.dirname, '../..');
const listFile = resolve(root, 'scripts/backfill-versions.json');
const marketplace = JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'));

// Static checks: the rows built from the committed list must agree with the catalog
// and each plugin.json. No network and no database.

test('rows are built for exactly the catalog plugins, in catalog order', () => {
  const rows = loadSkillRows(root, listFile);
  assert.deepStrictEqual(rows.map((r) => r.name), marketplace.plugins.map((p) => p.name));
});

test('every row has the fields the skills table requires', () => {
  for (const row of loadSkillRows(root, listFile)) {
    assert.ok(row.name && row.description && row.owner, `${row.name}: name, description, owner`);
    assert.ok(SPEC_CATEGORIES.includes(row.category), `${row.name}: category ${row.category} is in the spec vocabulary`);
    assert.strictEqual(typeof row.manifest_json, 'object');
    assert.strictEqual(row.icon_url, null);
  }
});

test('owner is the catalog owner, and matches each local plugin.json author', () => {
  for (const row of loadSkillRows(root, listFile)) {
    assert.strictEqual(row.owner, 'Cast Iron Productions LLC');
  }
  for (const plugin of marketplace.plugins.filter((p) => typeof p.source === 'string')) {
    const manifest = JSON.parse(readFileSync(resolve(root, plugin.source, '.claude-plugin/plugin.json'), 'utf8'));
    assert.strictEqual(manifest.author.name, 'Cast Iron Productions LLC', `${plugin.name}: author`);
  }
});

test('local plugins: description and manifest_json come from plugin.json and agree with the catalog', () => {
  const rows = loadSkillRows(root, listFile);
  for (const plugin of marketplace.plugins.filter((p) => typeof p.source === 'string')) {
    const manifest = JSON.parse(readFileSync(resolve(root, plugin.source, '.claude-plugin/plugin.json'), 'utf8'));
    const row = rows.find((r) => r.name === plugin.name);
    assert.deepStrictEqual(row.manifest_json, manifest);
    assert.strictEqual(row.description, manifest.description, `${plugin.name}: catalog and plugin.json descriptions agree`);
  }
});

test('a plugin hosted elsewhere uses its catalog entry as the manifest', () => {
  const rows = loadSkillRows(root, listFile);
  for (const plugin of marketplace.plugins.filter((p) => typeof p.source === 'object')) {
    assert.deepStrictEqual(rows.find((r) => r.name === plugin.name).manifest_json, plugin);
  }
});

test('the committed categories are the ones agreed: utility and pipeline', () => {
  const byName = Object.fromEntries(loadSkillRows(root, listFile).map((r) => [r.name, r.category]));
  assert.deepStrictEqual(byName, {
    'worktree-cleanup': 'utility',
    'morning-ingestion-pass': 'pipeline',
    'operational-ideas-harvest': 'pipeline',
    'toolforge-core': 'utility',
  });
});

const market = {
  owner: { name: 'Acme' },
  plugins: [
    { name: 'a', description: 'A', source: './plugins/a' },
    { name: 'b', description: 'B', source: { source: 'github', repo: 'x/y', ref: 'v1', sha: 'a'.repeat(40) } },
  ],
};
const readManifest = (source) => ({ from: source });
const build = (skills) => buildSkillRows({ marketplace: market, list: { skills }, readManifest });

test('buildSkillRows refuses a list that does not match the catalog', () => {
  const ok = [{ name: 'a', category: 'utility' }, { name: 'b', category: 'pipeline' }];
  assert.strictEqual(build(ok).length, 2);
  assert.throws(() => buildSkillRows({ marketplace: market, list: {}, readManifest }), /no "skills" section/);
  assert.throws(() => build([ok[0]]), /catalog plugin b has no entry/);
  assert.throws(() => build([...ok, { name: 'c', category: 'utility' }]), /c, which is not a plugin in the catalog/);
  assert.throws(() => build([...ok, ok[0]]), /duplicate entry for a/);
  assert.throws(() => build([ok[0], { name: 'b', category: 'ui' }]), /category "ui" is not one of/);
  assert.throws(() => build([ok[0], { name: 'b' }]), /category undefined is not one of/);
  assert.throws(() => build([{ category: 'utility' }, ok[1]]), /name is required/);
});

// A db double: skills and categories tables, with transaction bookkeeping.
function mockDb({ skills = [], categories = [], failInsertOn = null } = {}) {
  const log = [];
  let snapshot = null;
  const db = {
    skills,
    categories,
    log,
    query: async (text, params) => {
      if (text === 'BEGIN') { log.push('BEGIN'); snapshot = { skills: [...skills], categories: [...categories] }; return { rows: [] }; }
      if (text === 'COMMIT') { log.push('COMMIT'); return { rows: [] }; }
      if (text === 'ROLLBACK') {
        log.push('ROLLBACK');
        skills.splice(0, skills.length, ...snapshot.skills);
        categories.splice(0, categories.length, ...snapshot.categories);
        return { rows: [] };
      }
      if (/FROM skills WHERE name/.test(text)) return { rows: skills.filter((s) => s.name === params[0]) };
      if (/FROM categories WHERE slug/.test(text)) return { rows: categories.filter((c) => c.slug === params[0]) };
      if (/INSERT INTO categories/.test(text)) {
        if (!categories.some((c) => c.slug === params[0])) categories.push({ slug: params[0], display_name: params[1] });
        return { rows: [] };
      }
      if (/INSERT INTO skills/.test(text)) {
        if (params[0] === failInsertOn) throw new Error('insert failed');
        const [name, category, description, icon_url, owner, manifest] = params;
        const row = { name, category, description, icon_url, owner, manifest_json: JSON.parse(manifest) };
        skills.push(row);
        return { rows: [row] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  return db;
}

const rows = build([{ name: 'a', category: 'utility' }, { name: 'b', category: 'pipeline' }]);

test('a dry run writes nothing, and says which category rows it would add', async () => {
  const db = mockDb({ categories: [{ slug: 'utility', display_name: 'Utility' }] });
  const results = await createSkills({ db, rows, apply: false });
  assert.deepStrictEqual(results.map((r) => [r.name, r.status, r.newCategory]), [['a', 'dry-run', false], ['b', 'dry-run', true]]);
  assert.strictEqual(db.skills.length, 0);
  assert.strictEqual(db.categories.length, 1);
  assert.deepStrictEqual(db.log, [], 'a dry run opens no transaction');
});

test('apply creates the skills and the missing category rows in one transaction', async () => {
  const db = mockDb({ categories: [{ slug: 'utility', display_name: 'Utility' }] });
  const results = await createSkills({ db, rows, apply: true });
  assert.deepStrictEqual(results.map((r) => r.status), ['created', 'created']);
  assert.deepStrictEqual(db.skills.map((s) => [s.name, s.category, s.owner]), [['a', 'utility', 'Acme'], ['b', 'pipeline', 'Acme']]);
  assert.deepStrictEqual(db.categories.map((c) => [c.slug, c.display_name]), [['utility', 'Utility'], ['pipeline', 'Pipeline']]);
  assert.deepStrictEqual(db.log, ['BEGIN', 'COMMIT']);
});

test('a category shared by two skills is added once', async () => {
  const db = mockDb();
  const two = build([{ name: 'a', category: 'utility' }, { name: 'b', category: 'utility' }]);
  await createSkills({ db, rows: two, apply: true });
  assert.deepStrictEqual(db.categories.map((c) => c.slug), ['utility']);
});

test('a second run changes nothing', async () => {
  const db = mockDb();
  await createSkills({ db, rows, apply: true });
  const again = await createSkills({ db, rows, apply: true });
  assert.deepStrictEqual(again.map((r) => r.status), ['unchanged', 'unchanged']);
  assert.strictEqual(db.skills.length, 2);
});

test('a stored manifest with its keys in a different order is not a difference (jsonb reorders keys)', async () => {
  const manifest = { name: 'a', version: '1.0.0', author: { name: 'Acme', email: 'x@y' } };
  const row = { name: 'a', category: 'utility', description: 'A', owner: 'Acme', icon_url: null, manifest_json: manifest };
  const reordered = { author: { email: 'x@y', name: 'Acme' }, version: '1.0.0', name: 'a' };
  const db = mockDb({ skills: [{ ...row, manifest_json: reordered }] });
  const [result] = await createSkills({ db, rows: [row], apply: true });
  assert.deepStrictEqual(result, { name: 'a', status: 'unchanged', differences: [], newCategory: false });
});

test('a manifest whose values differ is still reported', async () => {
  const row = { name: 'a', category: 'utility', description: 'A', owner: 'Acme', icon_url: null, manifest_json: { name: 'a', version: '2.0.0' } };
  const db = mockDb({ skills: [{ ...row, manifest_json: { version: '1.0.0', name: 'a' } }] });
  const [result] = await createSkills({ db, rows: [row], apply: true });
  assert.deepStrictEqual(result.differences, ['manifest_json differs']);
});

test('an existing skill that differs is reported and left as it is', async () => {
  const existing = { name: 'a', category: 'devtools', description: 'old words', owner: 'soren', manifest_json: { from: './plugins/a' } };
  const db = mockDb({ skills: [existing] });
  const results = await createSkills({ db, rows, apply: true });
  assert.strictEqual(results[0].status, 'differs');
  assert.deepStrictEqual(results[0].differences, [
    'category: registry has "devtools", catalog has "utility"',
    'description: registry has "old words", catalog has "A"',
    'owner: registry has "soren", catalog has "Acme"',
  ]);
  assert.deepStrictEqual(db.skills[0], existing, 'the existing row is untouched');
  assert.strictEqual(results[1].status, 'created', 'the other skill is still created');
});

test('a failure rolls the whole run back', async () => {
  const db = mockDb({ failInsertOn: 'b' });
  await assert.rejects(() => createSkills({ db, rows, apply: true }), /insert failed/);
  assert.strictEqual(db.skills.length, 0, 'skill a is not left behind');
  assert.strictEqual(db.categories.length, 0, 'its category row is not left behind');
  assert.deepStrictEqual(db.log, ['BEGIN', 'ROLLBACK']);
});

test('--apply without a database is refused; a dry run without one still lists the rows', async () => {
  await assert.rejects(() => createSkills({ db: null, rows, apply: true }), /needs a database connection/);
  const results = await createSkills({ db: null, rows, apply: false });
  assert.deepStrictEqual(results.map((r) => r.status), ['dry-run', 'dry-run']);
});
