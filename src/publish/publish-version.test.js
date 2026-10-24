import test from 'node:test';
import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { makeGitFixture } from '../test-utils/git-fixture.js';
import { publishVersion } from './publish-version.js';

const execFileAsync = promisify(execFile);

const FILES = {
  'README.md': '# monorepo\n',
  'plugins/alpha/SKILL.md': '# alpha\n',
  'plugins/beta/SKILL.md': '# beta\n',
};

// A db double that answers the three queries publishVersion makes.
function mockDb({ skills = [{ id: 's1', name: 'demo' }], versions = [] } = {}) {
  return {
    versions,
    query: async (text, params) => {
      if (/FROM skills WHERE name/.test(text)) return { rows: skills.filter((s) => s.name === params[0]) };
      if (/FROM versions WHERE skill_id = \$1 AND version_tag/.test(text)) {
        return { rows: versions.filter((v) => v.skill_id === params[0] && v.version_tag === params[1]) };
      }
      if (/INSERT INTO versions/.test(text)) {
        const [skill_id, version_tag, release_date, changelog, checksum, source_repo, source_ref, source_sha, source_path] = params;
        const row = { id: `v${versions.length + 1}`, skill_id, version_tag, release_date, changelog, checksum, source_repo, source_ref, source_sha, source_path };
        if (versions.some((v) => v.checksum === checksum)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
        versions.push(row);
        return { rows: [row] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

const base = (fx, extra = {}) => ({
  skill: 'demo',
  tag: '1.0.0',
  repo: 'acme/demo',
  ref: 'light',
  baseUrl: `file://${fx.base}`,
  ...extra,
});

test('dry run resolves the ref and reports the row without writing it', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb();
  const { status, record } = await publishVersion({ db, ...base(fx) });
  assert.strictEqual(status, 'dry-run');
  assert.strictEqual(record.source_sha, fx.sha);
  assert.strictEqual(record.checksum, `git:${fx.sha}`);
  assert.strictEqual(db.versions.length, 0);
});

test('apply writes one row with the pinned source', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb();
  const { status, record } = await publishVersion({ db, ...base(fx, { apply: true, changelog: 'first' }) });
  assert.strictEqual(status, 'created');
  assert.strictEqual(db.versions.length, 1);
  assert.deepStrictEqual(
    { repo: record.source_repo, ref: record.source_ref, sha: record.source_sha, path: record.source_path, skill: record.skill_id, tag: record.version_tag },
    { repo: 'acme/demo', ref: 'light', sha: fx.sha, path: null, skill: 's1', tag: '1.0.0' }
  );
  assert.strictEqual(record.changelog, 'first');
});

test('publishing the same source again changes nothing', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb();
  await publishVersion({ db, ...base(fx, { apply: true }) });
  const again = await publishVersion({ db, ...base(fx, { apply: true }) });
  assert.strictEqual(again.status, 'unchanged');
  assert.strictEqual(db.versions.length, 1);
});

test('a different source under an existing tag is refused', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb();
  await publishVersion({ db, ...base(fx, { apply: true }) });
  await assert.rejects(
    () => publishVersion({ db, ...base(fx, { apply: true, ref: fx.branchSha }) }),
    /already published from a different source.*immutable/
  );
  assert.strictEqual(db.versions.length, 1);
});

test('publishing for a skill that is not in the registry is refused', async () => {
  const fx = makeGitFixture(FILES);
  await assert.rejects(() => publishVersion({ db: mockDb(), ...base(fx, { skill: 'ghost', apply: true }) }), /not in the registry/);
});

test('refs resolve to commits: lightweight tag, annotated tag, branch, and full SHA', async () => {
  const fx = makeGitFixture(FILES);
  const sha = async (ref) => (await publishVersion({ db: null, ...base(fx, { ref }) })).record.source_sha;
  assert.strictEqual(await sha('light'), fx.sha);
  assert.strictEqual(await sha('annot'), fx.sha, 'an annotated tag is peeled to its commit');
  assert.strictEqual(await sha('main'), fx.sha);
  assert.strictEqual(await sha(fx.sha), fx.sha);
  assert.strictEqual(await sha(fx.sha.toUpperCase()), fx.sha);
});

test('a branch ref is flagged as moving', async () => {
  const fx = makeGitFixture(FILES);
  const { notes } = await publishVersion({ db: null, ...base(fx, { ref: 'main' }) });
  assert.ok(notes.some((n) => /branch, which moves/.test(n)));
});

test('a name that is both a tag and a branch resolves to the tag, and says so', async () => {
  const fx = makeGitFixture(FILES);
  const { record, notes } = await publishVersion({ db: null, ...base(fx, { ref: 'dual' }) });
  assert.strictEqual(record.source_sha, fx.sha);
  assert.notStrictEqual(record.source_sha, fx.branchSha);
  assert.ok(notes.some((n) => /both a tag and a branch/.test(n)));
});

test('an unknown ref is refused', async () => {
  const fx = makeGitFixture(FILES);
  await assert.rejects(() => publishVersion({ db: null, ...base(fx, { ref: 'nope' }) }), /ref nope not found/);
});

test('a SHA that does not exist in the repository is refused and nothing is written', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb();
  await assert.rejects(() => publishVersion({ db, ...base(fx, { ref: 'a'.repeat(40), apply: true }) }), /is not installable/);
  assert.strictEqual(db.versions.length, 0);
});

test('a path that is missing at the commit is refused, because it could not be installed', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb();
  await assert.rejects(
    () => publishVersion({ db, ...base(fx, { path: 'plugins/gamma', apply: true }) }),
    /is not installable.*does not exist at the pinned commit/
  );
  assert.strictEqual(db.versions.length, 0);
});

test('a commit whose plugin has an escaping symlink is refused', async () => {
  const fx = makeGitFixture({ ...FILES, 'plugins/alpha/escape': { symlink: '../..' } });
  const db = mockDb();
  await assert.rejects(
    () => publishVersion({ db, ...base(fx, { path: 'plugins/alpha', apply: true }) }),
    /is not installable.*points outside the install directory/
  );
  assert.strictEqual(db.versions.length, 0);
});

test('two plugins at one commit get distinct checksums and both publish', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb({ skills: [{ id: 's1', name: 'alpha' }, { id: 's2', name: 'beta' }] });
  const a = await publishVersion({ db, ...base(fx, { skill: 'alpha', path: 'plugins/alpha', apply: true }) });
  const b = await publishVersion({ db, ...base(fx, { skill: 'beta', path: 'plugins/beta', apply: true }) });
  assert.strictEqual(a.record.checksum, `git:${fx.sha}:plugins/alpha`);
  assert.strictEqual(b.record.checksum, `git:${fx.sha}:plugins/beta`);
  assert.strictEqual(db.versions.length, 2);
});

test('a checksum collision from the database is reported plainly', async () => {
  const fx = makeGitFixture(FILES);
  const db = mockDb({ skills: [{ id: 's1', name: 'alpha' }, { id: 's2', name: 'beta' }] });
  await publishVersion({ db, ...base(fx, { skill: 'alpha', path: 'plugins/alpha', apply: true }) });
  await assert.rejects(
    () => publishVersion({ db, ...base(fx, { skill: 'beta', path: 'plugins/alpha', apply: true }) }),
    /checksum git:[0-9a-f]{40}:plugins\/alpha already exists/
  );
});

test('malformed inputs are refused before git runs', async () => {
  const fx = makeGitFixture(FILES);
  const bad = [
    [{ tag: 'v1' }, /Invalid|invalid/],
    [{ tag: '1.0' }, /Invalid|invalid/],
    [{ repo: '../x' }, /invalid repo/],
    [{ repo: 'acme' }, /invalid repo/],
    [{ ref: '-x' }, /invalid ref/],
    [{ ref: 'a..b' }, /invalid ref/],
    [{ ref: '' }, /invalid ref/],
    [{ path: '../x' }, /invalid path/],
    [{ path: '/etc' }, /invalid path/],
    [{ path: 'a/.git/b' }, /invalid path/],
    [{ skill: '' }, /skill name is required/],
  ];
  for (const [extra, pattern] of bad) {
    await assert.rejects(() => publishVersion({ db: null, ...base(fx, extra) }), pattern, JSON.stringify(extra));
  }
});

test('a dry run without a database still verifies the source and says registry checks were skipped', async () => {
  const fx = makeGitFixture(FILES);
  const { status, notes } = await publishVersion({ db: null, ...base(fx, { path: 'plugins/alpha' }) });
  assert.strictEqual(status, 'dry-run');
  assert.ok(notes.some((n) => /registry checks skipped/.test(n)));
});

test('--apply without a database is refused', async () => {
  const fx = makeGitFixture(FILES);
  await assert.rejects(() => publishVersion({ db: null, ...base(fx, { apply: true }) }), /needs a database connection/);
});

const script = resolve(import.meta.dirname, '../../scripts/publish-version.js');

test('the script dry-runs without DATABASE_URL, and refuses --apply without it', async () => {
  const fx = makeGitFixture(FILES);
  const env = { ...process.env, TOOLFORGE_GIT_BASE_URL: `file://${fx.base}` };
  delete env.DATABASE_URL;
  const args = ['--skill', 'demo', '--tag', '1.0.0', '--repo', 'acme/demo', '--ref', 'light'];

  const dry = await execFileAsync(process.execPath, [script, ...args], { env });
  assert.match(dry.stdout, /Would publish \(dry run; pass --apply to write\): demo 1\.0\.0/);
  assert.match(dry.stdout, new RegExp(`source:   acme/demo@${fx.sha}`));

  await assert.rejects(() => execFileAsync(process.execPath, [script, ...args, '--apply'], { env }), (err) => {
    assert.notStrictEqual(err.code, 0);
    assert.match(err.stderr, /--apply needs DATABASE_URL/);
    return true;
  });
});
