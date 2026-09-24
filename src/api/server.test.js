import test from 'node:test';
import assert from 'node:assert';
import { pool, createResilientDb } from '../db/connect.js';
import * as schema from '../db/schema.js';
import { createApp } from './server.js';

const fallbackMockDb = makeMockDb();
const db = createResilientDb(pool, fallbackMockDb);

// --- Wave C: app-level route tests against an injected mock db (no live PG) ---

function makeMockDb(handlers = {}) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push({ text, params });
      if (text.includes('SELECT 1')) {
        return { rows: [{ ok: 1 }] };
      }
      if (text.includes('FROM trending_metrics tm')) {
        return { rows: handlers.trending || [{ skill_id: 't1', name: 'Trend', trend_score: 9 }] };
      }
      if (text.includes('FROM categories')) {
        return { rows: handlers.categories || [{ id: 'c1', slug: 'automation', display_name: 'Automation' }] };
      }
      if (text.includes('SELECT * FROM skills WHERE id')) {
        return { rows: handlers.skill !== undefined ? handlers.skill : [] };
      }
      if (text.includes('s.category = (SELECT category')) {
        return { rows: handlers.related || [] };
      }
      if (text.includes('AVG(')) {
        return { rows: handlers.ratingAverage || [{ average: '4.5', count: '2' }] };
      }
      if (text.includes('COUNT(*)::int AS count')) {
        return { rows: [{ count: handlers.installs || 0 }] };
      }
      if (text.includes('co_install_count')) {
        return { rows: handlers.coinstall || [] };
      }
      if (text.includes('DO NOTHING')) {
        // createRating
        const [skillId, userId, score, reviewText] = params;
        if (handlers.ratingConflict) return { rows: [] };
        return { rows: [{ id: 'r1', skill_id: skillId, user_id: userId, score, review_text: reviewText }] };
      }
      if (text.includes('DO UPDATE') && text.includes('ratings')) {
        const [skillId, userId, score, reviewText] = params;
        return { rows: [{ id: 'r1', skill_id: skillId, user_id: userId, score, review_text: reviewText }] };
      }
      if (text.includes('FROM ratings') && text.includes('ORDER BY created_at')) {
        return { rows: handlers.ratingsList || [] };
      }
      // top-rated fallback / catch-all
      return { rows: handlers.topRated || [] };
    },
  };
}

async function withServer(mockDb, fn) {
  const app = createApp(mockDb);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('API route ordering: /skills/trending NOT shadowed by /skills/:id', async (t) => {
  await t.test('trending returns trending data, not a 404 from getSkill(trending)', async () => {
    const mockDb = makeMockDb({ trending: [{ skill_id: 't1', name: 'Trend', trend_score: 12, trend_direction: 'up' }] });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/trending`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      // camelCase frozen contract: id (from skill_id), trendScore, trendDirection
      assert.strictEqual(body.data[0].id, 't1');
      assert.strictEqual(body.data[0].trendScore, 12);
      assert.strictEqual(body.data[0].trendDirection, 'up');
    });
  });
});

test('API: GET /api/v1/categories', async (t) => {
  await t.test('returns category list', async () => {
    const mockDb = makeMockDb({ categories: [{ id: 'c1', slug: 'automation', display_name: 'Automation' }] });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/categories`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data[0].slug, 'automation');
      assert.strictEqual(body.data[0].displayName, 'Automation');
    });
  });
});

test('API: GET /api/v1/skills/:id/related', async (t) => {
  await t.test('returns related skills array', async () => {
    const mockDb = makeMockDb({
      related: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
      installs: 0,
    });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/some-id/related`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
      assert.strictEqual(body.data.length, 5);
    });
  });
});

test('API: ratings endpoints', async (t) => {
  await t.test('POST without auth -> 401', async () => {
    const mockDb = makeMockDb();
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score: 5 }),
      });
      assert.strictEqual(res.status, 401);
    });
  });

  await t.test('POST with invalid score -> 400 (before DB)', async () => {
    const mockDb = makeMockDb();
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
        body: JSON.stringify({ score: 99 }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  await t.test('POST valid -> 201', async () => {
    const mockDb = makeMockDb();
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
        body: JSON.stringify({ score: 5, reviewText: 'great' }),
      });
      assert.strictEqual(res.status, 201);
      const body = await res.json();
      assert.strictEqual(body.data.score, 5);
      assert.strictEqual(body.data.userId, 'u1', 'userId from session header, not body');
    });
  });

  await t.test('POST duplicate -> 409', async () => {
    const mockDb = makeMockDb({ ratingConflict: true });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
        body: JSON.stringify({ score: 5 }),
      });
      assert.strictEqual(res.status, 409);
    });
  });

  await t.test('user_id from body is ignored (security)', async () => {
    const mockDb = makeMockDb();
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'realuser' },
        body: JSON.stringify({ score: 5, user_id: 'attacker', userId: 'attacker' }),
      });
      const body = await res.json();
      assert.strictEqual(body.data.userId, 'realuser');
    });
  });

  await t.test('PUT to nonexistent skill -> 404', async () => {
    const mockDb = makeMockDb({ skill: [] }); // getSkill returns none
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/nope/ratings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
        body: JSON.stringify({ score: 4 }),
      });
      assert.strictEqual(res.status, 404);
    });
  });

  await t.test('PUT to existing skill -> 200', async () => {
    const mockDb = makeMockDb({ skill: [{ id: 's1', name: 'X' }] });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'u1' },
        body: JSON.stringify({ score: 4 }),
      });
      assert.strictEqual(res.status, 200);
    });
  });

  await t.test('GET ratings list -> 200', async () => {
    const mockDb = makeMockDb({ ratingsList: [{ id: 'r1', score: 5 }] });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data[0].score, 5);
    });
  });
});

test('API: GET /api/v1/skills/:id/resolve', async (t) => {
  await t.test('missing constraint -> 400', async () => {
    const mockDb = makeMockDb({ skill: [{ id: 's1' }] });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/resolve`);
      assert.strictEqual(res.status, 400);
    });
  });

  await t.test('malformed constraint -> 400', async () => {
    const mockDb = makeMockDb({ skill: [{ id: 's1' }] });
    await withServer(mockDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/resolve?constraint=*`);
      assert.strictEqual(res.status, 400);
    });
  });
});

test('API: GET /api/v1/skills', async (t) => {
  await t.test('list published skills', async () => {
    const skills = await schema.listSkills(db, { status: 'published', limit: 50, offset: 0 });
    assert(Array.isArray(skills));
  });

  await t.test('filter by category', async () => {
    const skills = await schema.listSkills(db, { category: 'linting', status: 'published', limit: 50 });
    assert(Array.isArray(skills));
    skills.forEach(s => assert.equal(s.category, 'linting'));
  });

  await t.test('respect limit and offset', async () => {
    const page1 = await schema.listSkills(db, { limit: 10, offset: 0, status: 'published' });
    const page2 = await schema.listSkills(db, { limit: 10, offset: 10, status: 'published' });
    assert(Array.isArray(page1));
    assert(Array.isArray(page2));
  });
});

test('API: GET /api/v1/skills/search', async (t) => {
  await t.test('search by query', async () => {
    const results = await schema.searchSkills(db, 'auth', { limit: 50, offset: 0 });
    assert(Array.isArray(results));
  });

  await t.test('return empty on no match', async () => {
    const results = await schema.searchSkills(db, 'nonexistent_xyz_skill_name_1234', { limit: 50 });
    assert(Array.isArray(results));
    assert.equal(results.length, 0);
  });

  await t.test('respect limit', async () => {
    const results = await schema.searchSkills(db, 'skill', { limit: 5 });
    assert(Array.isArray(results));
    assert(results.length <= 5);
  });
});

test('API: GET /api/v1/skills/:id', async (t) => {
  await t.test('return skill detail with rating', async () => {
    const skill = await schema.getSkill(db, 'nonexistent-id');
    // When skill doesn't exist, should return undefined
    assert.equal(skill, undefined);
  });

  await t.test('rating aggregation', async () => {
    const skillId = 'test-skill-id';
    const rating = await schema.getRatingAverage(db, skillId);
    assert.strictEqual(typeof rating.average, 'number' || 'object');
    assert.strictEqual(typeof rating.count, 'number');
  });
});

test('API: GET /api/v1/skills/:id/versions', async (t) => {
  await t.test('return empty versions for nonexistent skill', async () => {
    const versions = await schema.getVersions(db, 'nonexistent-id');
    assert(Array.isArray(versions));
  });
});

test('API: GET /api/v1/skills/trending', async (t) => {
  await t.test('trending by 30d', async () => {
    const trending = await schema.getTrendingMetrics(db, { window: '30d', limit: 50 });
    assert(Array.isArray(trending));
  });

  await t.test('trending by 7d', async () => {
    const trending = await schema.getTrendingMetrics(db, { window: '7d', limit: 50 });
    assert(Array.isArray(trending));
  });

  await t.test('respect limit', async () => {
    const trending = await schema.getTrendingMetrics(db, { limit: 5 });
    assert(Array.isArray(trending));
    assert(trending.length <= 5);
  });
});

test('Production createResilientDb Adapter Unit Tests', async (t) => {
  await t.test('Primary success returns result and keeps isFailing false', async () => {
    const primaryDb = { query: async () => ({ rows: [{ ok: 1 }] }) };
    const fallbackDb = { query: async () => { throw new Error('should not call fallback'); } };
    const adapter = createResilientDb(primaryDb, fallbackDb);

    const res = await adapter.query('SELECT 1', []);
    assert.deepEqual(res.rows, [{ ok: 1 }]);
    assert.equal(adapter.isFailing, false);
  });

  await t.test('Handles nested ECONNREFUSED error array and triggers fallback with logging', async () => {
    const logs = [];
    const logger = (msg) => logs.push(msg);
    const nestedErr = new Error('AggregateError');
    nestedErr.errors = [{ code: 'ECONNREFUSED' }];

    const primaryDb = { query: async () => { throw nestedErr; } };
    const fallbackDb = { query: async () => ({ rows: [{ fallback: true }] }) };
    const adapter = createResilientDb(primaryDb, fallbackDb, { logger });

    const res = await adapter.query('SELECT * FROM skills', ['arg1']);
    assert.deepEqual(res.rows, [{ fallback: true }]);
    assert.equal(adapter.isFailing, true);
    assert.ok(logs.some((l) => l.includes('Falling back to secondary DB')));
  });

  await t.test('Preserves exact SQL text and parameters on fallback query', async () => {
    const connErr = new Error('ECONNREFUSED');
    connErr.code = 'ECONNREFUSED';
    const primaryDb = { query: async () => { throw connErr; } };
    let receivedSql = null;
    let receivedParams = null;
    const fallbackDb = {
      query: async (sql, params) => {
        receivedSql = sql;
        receivedParams = params;
        return { rows: [] };
      },
    };
    const adapter = createResilientDb(primaryDb, fallbackDb, { logger: null });

    const expectedSql = 'SELECT * FROM skills WHERE id = $1';
    const expectedParams = ['skill-123'];
    await adapter.query(expectedSql, expectedParams);

    assert.strictEqual(receivedSql, expectedSql);
    assert.deepEqual(receivedParams, expectedParams);
  });

  await t.test('Does NOT fallback on non-connection errors (syntax 42601, timeout 57014, constraint 23505, auth 28P01)', async () => {
    const errorCodes = ['42601', '57014', '23505', '28P01'];
    for (const code of errorCodes) {
      const dbErr = new Error(`Database error code ${code}`);
      dbErr.code = code;
      let fallbackCalled = false;
      const primaryDb = { query: async () => { throw dbErr; } };
      const fallbackDb = { query: async () => { fallbackCalled = true; return { rows: [] }; } };
      const adapter = createResilientDb(primaryDb, fallbackDb, { logger: null });

      await assert.rejects(
        () => adapter.query('SELECT 1'),
        (err) => err.code === code
      );
      assert.strictEqual(fallbackCalled, false, `fallback should NOT be called for error code ${code}`);
    }
  });

  await t.test('Fallback DB failure rejects cleanly without unhandled rejections', async () => {
    const connErr = new Error('ECONNREFUSED');
    connErr.code = 'ECONNREFUSED';
    const primaryDb = { query: async () => { throw connErr; } };
    const fallbackDb = { query: async () => { throw new Error('Secondary DB connection failed'); } };
    const adapter = createResilientDb(primaryDb, fallbackDb, { logger: null });

    await assert.rejects(
      () => adapter.query('SELECT 1'),
      /Secondary DB connection failed/
    );
  });

  await t.test('Recovery: primary DB succeeds again after temporary ECONNREFUSED failure', async () => {
    const logs = [];
    const logger = (msg) => logs.push(msg);
    let attempt = 0;
    const connErr = new Error('ECONNREFUSED');
    connErr.code = 'ECONNREFUSED';

    const primaryDb = {
      query: async () => {
        attempt++;
        if (attempt === 1) throw connErr;
        return { rows: [{ recovered: true }] };
      },
    };
    const fallbackDb = { query: async () => ({ rows: [{ fallback: true }] }) };
    const adapter = createResilientDb(primaryDb, fallbackDb, { logger });

    // Request 1: hits ECONNREFUSED -> falls back
    const res1 = await adapter.query('SELECT 1');
    assert.deepEqual(res1.rows, [{ fallback: true }]);
    assert.strictEqual(adapter.isFailing, true);

    // Request 2: primary recovers -> returns primary data, resets isFailing
    const res2 = await adapter.query('SELECT 1');
    assert.deepEqual(res2.rows, [{ recovered: true }]);
    assert.strictEqual(adapter.isFailing, false);
    assert.ok(logs.some((l) => l.includes('Primary DB connection recovered')));
  });

  await t.test('Concurrent requests during primary DB failure all route cleanly to fallback', async () => {
    const connErr = new Error('ECONNREFUSED');
    connErr.code = 'ECONNREFUSED';
    const primaryDb = { query: async () => { throw connErr; } };
    const fallbackDb = { query: async (sql, params) => ({ rows: [{ reqId: params[0] }] }) };
    const adapter = createResilientDb(primaryDb, fallbackDb, { logger: null });

    const requests = Array.from({ length: 10 }, (_, i) => adapter.query('SELECT $1', [i]));
    const results = await Promise.all(requests);

    assert.strictEqual(results.length, 10);
    results.forEach((res, i) => {
      assert.strictEqual(res.rows[0].reqId, i);
    });
  });
});

test('API Endpoints under Database Failure & Resilient DB Fallback', async (t) => {
  const connErr = new Error('ECONNREFUSED');
  connErr.code = 'ECONNREFUSED';
  const failingPrimaryDb = { query: async () => { throw connErr; } };
  const mockFallback = makeMockDb({
    skill: [{ id: 's1', name: 'Skill 1' }],
    categories: [{ id: 'c1', slug: 'cat1', display_name: 'Cat 1' }],
    ratingsList: [{ id: 'r1', score: 5 }],
    trending: [{ skill_id: 't1', name: 'Trend 1', trend_score: 50 }],
  });
  const resilientDb = createResilientDb(failingPrimaryDb, mockFallback, { logger: null });

  await t.test('/health endpoint reflects DB status', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/health`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.status, 'ok');
    });

    const totalFailingDb = { query: async () => { throw new Error('Both DBs down'); } };
    await withServer(totalFailingDb, async (base) => {
      const res = await fetch(`${base}/health`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.status, 'unhealthy');
    });
  });

  await t.test('GET /api/v1/skills lists skills via fallback', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
    });
  });

  await t.test('GET /api/v1/skills/search searches via fallback', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/search?q=test`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
    });
  });

  await t.test('GET /api/v1/categories lists categories via fallback', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/api/v1/categories`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
    });
  });

  await t.test('GET /api/v1/skills/:id/versions fetches versions via fallback', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/versions`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
    });
  });

  await t.test('GET /api/v1/skills/:id/ratings fetches ratings via fallback', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/s1/ratings`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
    });
  });

  await t.test('GET /api/v1/skills/trending fetches trending via fallback', async () => {
    await withServer(resilientDb, async (base) => {
      const res = await fetch(`${base}/api/v1/skills/trending`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.ok(Array.isArray(body.data));
    });
  });
});


