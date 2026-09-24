import test from 'node:test';
import assert from 'node:assert';
import { createApp } from './server.js';


function makeMockDb() {
  return {
    query: async () => ({ rows: [{ ok: 1 }] }),
  };
}

async function withServer(mockDb, opts, fn) {
  if (typeof opts === 'function') {
    fn = opts;
    opts = {};
  }
  const app = createApp(mockDb, opts);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}


test('Providers API Router' + ' - Security & Conformance', async (t) => {
  const mockDb = makeMockDb();
  const authHeaders = { 'x-user-id': 'user-123', 'Content-Type': 'application/json' };

  await t.test('GET /health/provider returns healthy without information disclosure', async () => {
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/health/provider`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.status, 'healthy');
      assert.strictEqual(body.provider, 'OllamaProvider');
      assert.strictEqual(body.endpoint, undefined, 'Must not expose internal endpoint URL');
      assert.strictEqual(body.OLLAMA_BASE_URL, undefined);
    });
  });

  await t.test('Rejects unauthorized access to /api/generate, /api/audit, and /api/models', async () => {
    await withServer(mockDb, async (base) => {
      const resGen = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3.2', prompt: 'test' }),
      });
      assert.strictEqual(resGen.status, 401);

      const resAud = await fetch(`${base}/api/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packetId: 'p-1' }),
      });
      assert.strictEqual(resAud.status, 401);

      const resMod = await fetch(`${base}/api/models`);
      assert.strictEqual(resMod.status, 401);
    });
  });

  await t.test('POST /api/generate does NOT return the submitted prompt', async () => {
    const mockProvider = {
      generate: async () => 'Successful completion',
    };
    await withServer(mockDb, { provider: mockProvider }, async (base) => {
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ model: 'llama3.2', prompt: 'secret confidential prompt' }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.model, 'llama3.2');
      assert.strictEqual(body.result, 'Successful completion');
      assert.strictEqual(body.prompt, undefined, 'Must not return submitted prompt');
    });
  });

  await t.test('POST /api/generate rejects oversized prompts with 413', async () => {
    await withServer(mockDb, async (base) => {
      const hugePrompt = 'a'.repeat(35000);
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ model: 'llama3.2', prompt: hugePrompt }),
      });
      assert.strictEqual(res.status, 413);
      const body = await res.json();
      assert.strictEqual(body.error, 'Prompt exceeds maximum allowed size');
    });
  });

  await t.test('/api/audit fails closed on malformed model output', async () => {
    const malformedProvider = {
      generate: async () => 'Sorry, I as an AI cannot fulfill this',
    };
    await withServer(mockDb, { provider: malformedProvider }, async (base) => {
      const res = await fetch(`${base}/api/audit`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          packetId: 'packet-999',
          specGoal: 'Verify audit',
          declaredScope: ['src/api/server.js'],
          testOutput: 'failed',
          appliedDiff: '- old\n+ new',
          historyLog: ['init'],
        }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.verdict.consensus, false);
      assert.ok(body.verdict.blockerAnalysis.includes('malformed'));
    });
  });

  await t.test('Rate limiting enforces 429 when threshold exceeded', async () => {
    const strictLimiter = (req, res, next) => {
      // Mock limiter that permits 2 requests then throws 429
      if (!req.app.locals.counter) req.app.locals.counter = 0;
      req.app.locals.counter += 1;
      if (req.app.locals.counter > 2) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Too many requests' });
      }
      next();
    };

    const mockProvider = { generate: async () => 'OK' };
    await withServer(mockDb, { provider: mockProvider, limiter: strictLimiter }, async (base) => {
      const res1 = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ model: 'llama3.2', prompt: 'test 1' }),
      });
      assert.strictEqual(res1.status, 200);

      const res2 = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ model: 'llama3.2', prompt: 'test 2' }),
      });
      assert.strictEqual(res2.status, 200);

      const res3 = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ model: 'llama3.2', prompt: 'test 3' }),
      });
      assert.strictEqual(res3.status, 429);
      assert.strictEqual(res3.headers.get('retry-after'), '60');
      const body = await res3.json();
      assert.strictEqual(body.error, 'Too many requests');
    });
  });

  await t.test('Concurrency guard rejects requests exceeding MAX_CONCURRENT_CALLS with 503', async () => {
    let unblockCalls;
    const slowProvider = {
      generate: () => new Promise((resolve) => {
        // Hold execution until all 6 are dispatched
        const timer = setTimeout(() => resolve('Finished'), 500);
        unblockCalls = () => {
          clearTimeout(timer);
          resolve('Finished');
        };
      }),
    };

    await withServer(mockDb, { provider: slowProvider }, async (base) => {
      const makeCall = () => fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ model: 'llama3.2', prompt: 'parallel' }),
      });

      // Dispatch 6 calls simultaneously (limit is 5)
      const promises = [makeCall(), makeCall(), makeCall(), makeCall(), makeCall(), makeCall()];
      const results = await Promise.all(promises);
      const statuses = results.map(r => r.status);

      // At least 1 request must be rejected with 503 capacity saturated
      assert.ok(statuses.includes(503), 'Must reject requests exceeding concurrency cap with 503');
      if (unblockCalls) unblockCalls();
    });
  });
});
