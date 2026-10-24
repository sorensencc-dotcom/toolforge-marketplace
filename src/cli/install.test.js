import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const cliPath = resolve(import.meta.dirname, 'index.js');

function startMockApi() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = { data: null };
    if (url.pathname === '/api/v1/skills/search') body = { data: [{ id: 's1', name: 'demo' }] };
    else if (url.pathname === '/api/v1/skills/s1') body = { data: { id: 's1', name: 'demo' } };
    else if (url.pathname === '/api/v1/skills/s1/versions') body = { data: [{ version_tag: '1.0.0' }] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  });
  return new Promise((done) => server.listen(0, () => done(server)));
}

test('CLI install exits non-zero and writes nothing while package download is unimplemented', async () => {
  const server = await startMockApi();
  const dest = resolve(mkdtempSync(resolve(tmpdir(), 'tf-install-')), 'skills');
  try {
    await assert.rejects(
      () =>
        execFileAsync(process.execPath, [
          cliPath,
          '--api-url',
          `http://localhost:${server.address().port}`,
          'install',
          'demo',
          '--destination',
          dest,
        ]),
      (err) => {
        assert.notStrictEqual(err.code, 0);
        assert.match(err.stderr, /package download is not implemented/);
        return true;
      }
    );
    assert.strictEqual(existsSync(dest), false, 'no install directory should be created');
  } finally {
    server.close();
  }
});
