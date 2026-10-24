import test from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { makeGitFixture } from '../test-utils/git-fixture.js';
import { loadBackfillList, runBackfill } from './backfill.js';

const root = resolve(import.meta.dirname, '../..');
const listFile = resolve(root, 'scripts/backfill-versions.json');
const marketplace = JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'));

// Static checks: the committed list must agree with the catalog it backfills.
// No network and no database.

test('the committed list is well formed', () => {
  assert.ok(loadBackfillList(listFile).length > 0);
});

test('every catalog plugin has exactly one backfill entry, and nothing else does', () => {
  const listed = loadBackfillList(listFile).map((e) => e.skill).sort();
  assert.deepStrictEqual(listed, marketplace.plugins.map((p) => p.name).sort());
});

test('local plugins: tag matches plugin.json, path matches the catalog source, repo is this one', () => {
  const entries = loadBackfillList(listFile);
  for (const plugin of marketplace.plugins.filter((p) => typeof p.source === 'string')) {
    const entry = entries.find((e) => e.skill === plugin.name);
    const manifest = JSON.parse(readFileSync(resolve(root, plugin.source, '.claude-plugin/plugin.json'), 'utf8'));
    assert.strictEqual(entry.tag, manifest.version, `${plugin.name}: tag must equal plugin.json version`);
    assert.strictEqual(entry.path, plugin.source.replace(/^\.\//, ''), `${plugin.name}: path must match the catalog source`);
    assert.strictEqual(entry.repo, 'sorensencc-dotcom/toolforge-marketplace');
  }
});

test('github plugins: repo, ref, and sha match the catalog pin, and the tag is that ref without the v', () => {
  const entries = loadBackfillList(listFile);
  for (const plugin of marketplace.plugins.filter((p) => typeof p.source === 'object' && p.source.source === 'github')) {
    const entry = entries.find((e) => e.skill === plugin.name);
    assert.strictEqual(entry.repo, plugin.source.repo);
    assert.strictEqual(entry.ref, plugin.source.ref);
    assert.strictEqual(entry.sha, plugin.source.sha);
    assert.strictEqual(entry.tag, plugin.source.ref.replace(/^v/, ''));
    assert.strictEqual(entry.path, undefined, `${plugin.name}: a whole-repo plugin has no path`);
  }
});

function writeList(versions) {
  const file = resolve(mkdtempSync(resolve(tmpdir(), 'tf-backfill-')), 'list.json');
  writeFileSync(file, JSON.stringify({ versions }));
  return file;
}

test('loadBackfillList rejects malformed lists', () => {
  const ok = { skill: 'a', tag: '1.0.0', repo: 'acme/demo', ref: 'light', sha: 'a'.repeat(40) };
  assert.throws(() => loadBackfillList(writeList([])), /at least one entry/);
  assert.throws(() => loadBackfillList(writeList([{ ...ok, sha: 'main' }])), /sha must be a 40-character/);
  assert.throws(() => loadBackfillList(writeList([{ ...ok, tag: '' }])), /tag is required/);
  assert.throws(() => loadBackfillList(writeList([{ ...ok, path: 3 }])), /path must be a string/);
  assert.throws(() => loadBackfillList(writeList([ok, ok])), /duplicate entry for a@1\.0\.0/);
});

function mockDb(skills) {
  const versions = [];
  return {
    versions,
    query: async (text, params) => {
      if (/FROM skills WHERE name/.test(text)) return { rows: skills.filter((s) => s.name === params[0]) };
      if (/FROM versions WHERE skill_id = \$1 AND version_tag/.test(text)) {
        return { rows: versions.filter((v) => v.skill_id === params[0] && v.version_tag === params[1]) };
      }
      if (/INSERT INTO versions/.test(text)) {
        const [skill_id, version_tag, , , checksum, source_repo, , source_sha, source_path] = params;
        const row = { skill_id, version_tag, checksum, source_repo, source_sha, source_path };
        versions.push(row);
        return { rows: [row] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

test('runBackfill publishes each entry, keeps going past a failure, and a re-run finishes the job', async () => {
  const fx = makeGitFixture({ 'plugins/alpha/SKILL.md': '# a\n', 'plugins/beta/SKILL.md': '# b\n' });
  const baseUrl = `file://${fx.base}`;
  const entries = [
    { skill: 'alpha', tag: '1.0.0', repo: 'acme/demo', ref: 'light', sha: fx.sha, path: 'plugins/alpha' },
    { skill: 'missing', tag: '1.0.0', repo: 'acme/demo', ref: 'light', sha: fx.sha, path: 'plugins/beta' },
    { skill: 'beta', tag: '1.0.0', repo: 'acme/demo', ref: 'light', sha: fx.sha, path: 'plugins/beta' },
  ];
  const db = mockDb([{ id: 's1', name: 'alpha' }, { id: 's2', name: 'beta' }]);

  const first = await runBackfill({ db, entries, apply: true, baseUrl });
  assert.deepStrictEqual(first.map((r) => r.status), ['created', 'failed', 'created']);
  assert.match(first[1].error, /not in the registry/);
  assert.strictEqual(db.versions.length, 2);

  const second = await runBackfill({ db, entries, apply: true, baseUrl });
  assert.deepStrictEqual(second.map((r) => r.status), ['unchanged', 'failed', 'unchanged']);
  assert.strictEqual(db.versions.length, 2, 'a re-run writes nothing new');
});

test('a dry run writes nothing', async () => {
  const fx = makeGitFixture({ 'plugins/alpha/SKILL.md': '# a\n' });
  const db = mockDb([{ id: 's1', name: 'alpha' }]);
  const entries = [{ skill: 'alpha', tag: '1.0.0', repo: 'acme/demo', ref: 'light', sha: fx.sha, path: 'plugins/alpha' }];
  const [result] = await runBackfill({ db, entries, apply: false, baseUrl: `file://${fx.base}` });
  assert.strictEqual(result.status, 'dry-run');
  assert.strictEqual(db.versions.length, 0);
});

test('an entry whose ref has moved off the expected commit is refused', async () => {
  const fx = makeGitFixture({ 'SKILL.md': '# a\n' });
  const db = mockDb([{ id: 's1', name: 'alpha' }]);
  const entries = [{ skill: 'alpha', tag: '1.0.0', repo: 'acme/demo', ref: 'dual', sha: fx.branchSha }];
  // `dual` is a tag on fx.sha and a branch at fx.branchSha; the tag wins, so the expectation fails.
  const [result] = await runBackfill({ db, entries, apply: true, baseUrl: `file://${fx.base}` });
  assert.strictEqual(result.status, 'failed');
  assert.match(result.error, /resolves to .*, not the expected/);
  assert.strictEqual(db.versions.length, 0);
});
