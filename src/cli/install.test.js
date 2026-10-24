import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const cliPath = resolve(import.meta.dirname, 'index.js');

function startMockApi({ name = 'demo', versions }) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = { data: null };
    if (url.pathname === '/api/v1/skills/search') body = { data: [{ id: 's1', name }] };
    else if (url.pathname === '/api/v1/skills/s1') body = { data: { id: 's1', name } };
    else if (url.pathname === '/api/v1/skills/s1/versions') body = { data: versions };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  return new Promise((done) => server.listen(0, () => done(server)));
}

// A bare repo at <base>/acme/demo.git with one commit. `files` maps a repo path to
// its content, or to { symlink: target } for a symbolic link. Returns the base dir
// and the commit SHA.
const DEFAULT_FILES = { 'SKILL.md': '# demo\n' };

function makeGitFixture(files = DEFAULT_FILES) {
  const base = mkdtempSync(resolve(tmpdir(), 'tf-git-'));
  const work = resolve(base, 'work');
  mkdirSync(work);
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
  git(work, 'init', '-q', '-b', 'main');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'user.name', 'Test');
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(work, path);
    mkdirSync(dirname(full), { recursive: true });
    if (typeof content === 'object') symlinkSync(content.symlink, full);
    else writeFileSync(full, content);
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'init');
  const sha = git(work, 'rev-parse', 'HEAD');
  mkdirSync(resolve(base, 'acme'));
  git(base, 'clone', '-q', '--bare', work, resolve(base, 'acme', 'demo.git'));
  return { base, sha };
}

async function runInstall(server, dest, { env = {}, args = [] } = {}) {
  return execFileAsync(
    process.execPath,
    [cliPath, '--api-url', `http://localhost:${server.address().port}`, 'install', 'demo', '--destination', dest, ...args],
    { env: { ...process.env, ...env } }
  );
}

const newDest = () => resolve(mkdtempSync(resolve(tmpdir(), 'tf-install-')), 'skills');

test('install refuses a version with no recorded source and writes nothing', async () => {
  const server = await startMockApi({ versions: [{ version_tag: '1.0.0' }] });
  const dest = newDest();
  try {
    await assert.rejects(() => runInstall(server, dest), (err) => {
      assert.notStrictEqual(err.code, 0);
      assert.match(err.stderr, /records no source/);
      return true;
    });
    assert.strictEqual(existsSync(dest), false);
  } finally {
    server.close();
  }
});

test('install checks out the pinned commit, drops .git, and records the source', async () => {
  const { base, sha } = makeGitFixture();
  const server = await startMockApi({
    versions: [{ version_tag: '1.0.0', source_repo: 'acme/demo', source_ref: 'v1.0.0', source_sha: sha }],
  });
  const dest = newDest();
  try {
    const { stdout } = await runInstall(server, dest, { env: { TOOLFORGE_GIT_BASE_URL: `file://${base}` } });
    assert.match(stdout, /Installed demo v1\.0\.0/);
    const target = resolve(dest, 'demo');
    assert.strictEqual(readFileSync(resolve(target, 'SKILL.md'), 'utf8'), '# demo\n');
    assert.strictEqual(existsSync(resolve(target, '.git')), false);
    const meta = JSON.parse(readFileSync(resolve(target, '.toolforge-install.json'), 'utf8'));
    assert.deepStrictEqual(meta.source, { repo: 'acme/demo', ref: 'v1.0.0', sha, path: null });
  } finally {
    server.close();
  }
});

test('install fails and leaves nothing behind when the pinned commit does not exist', async () => {
  const { base } = makeGitFixture();
  const server = await startMockApi({
    versions: [{ version_tag: '1.0.0', source_repo: 'acme/demo', source_sha: 'a'.repeat(40) }],
  });
  const dest = newDest();
  try {
    await assert.rejects(() => runInstall(server, dest, { env: { TOOLFORGE_GIT_BASE_URL: `file://${base}` } }), (err) => {
      assert.notStrictEqual(err.code, 0);
      assert.match(err.stderr, /could not fetch acme\/demo@/);
      return true;
    });
    assert.strictEqual(existsSync(resolve(dest, 'demo')), false);
  } finally {
    server.close();
  }
});

test('install rejects a malformed source from the registry before touching git', async () => {
  for (const source of [
    { source_repo: 'acme/demo', source_sha: 'main' },
    { source_repo: 'acme/demo', source_sha: 'abc123' },
    { source_repo: '../../etc', source_sha: 'a'.repeat(40) },
    { source_repo: '--upload-pack=evil/x', source_sha: 'a'.repeat(40) },
    { source_repo: 'acme/demo', source_sha: null },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: '../x' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: '/etc' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: 'a//b' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: './a' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: 'a/./b' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: 'plugins/.git/hooks' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: 'a b' },
    { source_repo: 'acme/demo', source_sha: 'a'.repeat(40), source_path: 'a;rm' },
    { source_path: 'plugins/alpha' },
  ]) {
    const server = await startMockApi({ versions: [{ version_tag: '1.0.0', ...source }] });
    const dest = newDest();
    try {
      await assert.rejects(() => runInstall(server, dest), (err) => {
        assert.notStrictEqual(err.code, 0);
        assert.match(err.stderr, /invalid source_(repo|sha|path)/);
        return true;
      });
      assert.strictEqual(existsSync(dest), false);
    } finally {
      server.close();
    }
  }
});

test('install rejects a skill name that would escape the destination', async () => {
  const { base, sha } = makeGitFixture();
  const server = await startMockApi({
    name: '../evil',
    versions: [{ version_tag: '1.0.0', source_repo: 'acme/demo', source_sha: sha }],
  });
  const dest = newDest();
  try {
    await assert.rejects(() => runInstall(server, dest, { env: { TOOLFORGE_GIT_BASE_URL: `file://${base}` } }), (err) => {
      assert.match(err.stderr, /unsafe skill name/);
      return true;
    });
    assert.strictEqual(existsSync(resolve(dest, '..', 'evil')), false);
  } finally {
    server.close();
  }
});

const PLUGIN_FILES = {
  'README.md': '# monorepo\n',
  'plugins/alpha/SKILL.md': '# alpha\n',
  'plugins/alpha/src/run.js': 'export default 1;\n',
  'plugins/beta/SKILL.md': '# beta\n',
};

const versionFor = (sha, extra) => [{ version_tag: '1.0.0', source_repo: 'acme/demo', source_sha: sha, ...extra }];

async function installFails(files, extra, pattern) {
  const { base, sha } = makeGitFixture(files);
  const server = await startMockApi({ versions: versionFor(sha, extra) });
  const dest = newDest();
  try {
    await assert.rejects(() => runInstall(server, dest, { env: { TOOLFORGE_GIT_BASE_URL: `file://${base}` } }), (err) => {
      assert.notStrictEqual(err.code, 0);
      assert.match(err.stderr, pattern);
      return true;
    });
    assert.strictEqual(existsSync(resolve(dest, 'demo')), false, 'a failed install leaves no directory');
  } finally {
    server.close();
  }
}

test('install copies only the pinned subdirectory and records its path', async () => {
  const { base, sha } = makeGitFixture(PLUGIN_FILES);
  const server = await startMockApi({ versions: versionFor(sha, { source_path: 'plugins/alpha' }) });
  const dest = newDest();
  try {
    const { stdout } = await runInstall(server, dest, { env: { TOOLFORGE_GIT_BASE_URL: `file://${base}` } });
    assert.match(stdout, /acme\/demo\/plugins\/alpha@/);
    const target = resolve(dest, 'demo');
    assert.strictEqual(readFileSync(resolve(target, 'SKILL.md'), 'utf8'), '# alpha\n');
    assert.strictEqual(readFileSync(resolve(target, 'src/run.js'), 'utf8'), 'export default 1;\n');
    assert.strictEqual(existsSync(resolve(target, 'README.md')), false, 'repo root files are not copied');
    assert.strictEqual(existsSync(resolve(target, 'plugins')), false, 'sibling plugins are not copied');
    assert.strictEqual(existsSync(resolve(target, '.git')), false);
    const meta = JSON.parse(readFileSync(resolve(target, '.toolforge-install.json'), 'utf8'));
    assert.deepStrictEqual(meta.source, { repo: 'acme/demo', ref: null, sha, path: 'plugins/alpha' });
    assert.deepStrictEqual(readdirSync(resolve(dest)).sort(), ['demo']);
  } finally {
    server.close();
  }
});

test('install fails when the pinned subdirectory is absent at that commit', async () => {
  await installFails(PLUGIN_FILES, { source_path: 'plugins/gamma' }, /path plugins\/gamma does not exist at the pinned commit/);
});

test('install fails when the pinned path is a file, not a directory', async () => {
  await installFails(PLUGIN_FILES, { source_path: 'plugins/alpha/SKILL.md' }, /is not a directory/);
});

test('install fails when the pinned path is itself a symbolic link', async () => {
  await installFails(
    { ...PLUGIN_FILES, 'plugins/link': { symlink: 'alpha' } },
    { source_path: 'plugins/link' },
    /is a symbolic link, not a directory/
  );
});

test('install refuses a symlink that points outside the install, in a subdirectory', async () => {
  await installFails(
    { ...PLUGIN_FILES, 'plugins/alpha/escape': { symlink: '../..' } },
    { source_path: 'plugins/alpha' },
    /points outside the install directory/
  );
});

test('install refuses an absolute symlink, in a whole-repository install', async () => {
  await installFails({ 'SKILL.md': '# demo\n', passwd: { symlink: '/etc/passwd' } }, {}, /points outside the install directory/);
});

test('install refuses a symlink that escapes through a link back to the root', async () => {
  await installFails(
    { 'SKILL.md': '# demo\n', self: { symlink: '.' }, escape: { symlink: 'self/../outside' } },
    {},
    /(points outside the install directory|is broken or loops)/
  );
});

test('install refuses a broken symlink', async () => {
  await installFails({ 'SKILL.md': '# demo\n', dangling: { symlink: 'nowhere' } }, {}, /is broken or loops/);
});

test('install allows a symlink that stays inside the install', async () => {
  const { base, sha } = makeGitFixture({ 'SKILL.md': '# demo\n', 'docs/guide.md': 'guide\n', 'docs/latest.md': { symlink: 'guide.md' } });
  const server = await startMockApi({ versions: versionFor(sha, {}) });
  const dest = newDest();
  try {
    await runInstall(server, dest, { env: { TOOLFORGE_GIT_BASE_URL: `file://${base}` } });
    assert.strictEqual(readFileSync(resolve(dest, 'demo', 'docs', 'latest.md'), 'utf8'), 'guide\n');
  } finally {
    server.close();
  }
});
