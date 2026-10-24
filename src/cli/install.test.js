import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

// A bare repo at <base>/acme/demo.git with one commit. Returns the base dir and the commit SHA.
function makeGitFixture() {
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
  writeFileSync(resolve(work, 'SKILL.md'), '# demo\n');
  git(work, 'add', '.');
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
    assert.deepStrictEqual(meta.source, { repo: 'acme/demo', ref: 'v1.0.0', sha });
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
  ]) {
    const server = await startMockApi({ versions: [{ version_tag: '1.0.0', ...source }] });
    const dest = newDest();
    try {
      await assert.rejects(() => runInstall(server, dest), (err) => {
        assert.notStrictEqual(err.code, 0);
        assert.match(err.stderr, /invalid source_(repo|sha)/);
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
