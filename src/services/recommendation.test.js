import test from 'node:test';
import assert from 'node:assert';
import { getRelated, RecommendationError, COINSTALL_THRESHOLD } from './recommendation.js';

// Dispatching mock db keyed on query shape (schema.js SQL fingerprints).
function makeMockDb({ category = [], coinstall = [], installs = 0, topRated = [] } = {}) {
  const calls = { category: 0, coinstall: 0, installs: 0, topRated: 0 };
  return {
    calls,
    query: async (text) => {
      if (text.includes('co_install_count')) {
        calls.coinstall++;
        return { rows: coinstall };
      }
      if (text.includes('COUNT(*)::int AS count')) {
        calls.installs++;
        return { rows: [{ count: installs }] };
      }
      if (text.includes('s.category = (SELECT category')) {
        calls.category++;
        return { rows: category };
      }
      // getTopRatedSkills fallback (published, no category subquery)
      calls.topRated++;
      return { rows: topRated };
    },
  };
}

const skill = (id, extra = {}) => ({ id, name: `skill-${id}`, category: 'automation', status: 'published', ...extra });

test('recommendation: validation', async (t) => {
  await t.test('missing skillId throws RecommendationError', async () => {
    const db = makeMockDb();
    await assert.rejects(() => getRelated(db, null), RecommendationError);
  });
});

test('recommendation: category default (below install threshold)', async (t) => {
  await t.test('returns category rows, skips co-install query', async () => {
    const category = [skill('a', { rating_avg: 4.5, installs_30d: 100 }), skill('b'), skill('c'), skill('d'), skill('e')];
    const db = makeMockDb({ category, installs: 10 });
    const results = await getRelated(db, 'target', { limit: 10 });
    assert.strictEqual(results.length, 5);
    assert.strictEqual(db.calls.coinstall, 0, 'co-install not queried below threshold');
  });

  await t.test('respects limit', async () => {
    const category = Array.from({ length: 20 }, (_, i) => skill(`s${i}`, { rating_avg: 20 - i }));
    const db = makeMockDb({ category, installs: 0 });
    const results = await getRelated(db, 'target', { limit: 3 });
    assert.strictEqual(results.length, 3);
  });
});

test('recommendation: sparsity fallback', async (t) => {
  await t.test('backfills from top-rated when < 5 category results', async () => {
    const category = [skill('a'), skill('b')]; // only 2
    const topRated = [skill('t1'), skill('t2'), skill('t3'), skill('t4')];
    const db = makeMockDb({ category, installs: 0, topRated });
    const results = await getRelated(db, 'target', { limit: 10 });
    assert.ok(results.length > 2, 'section backfilled');
    assert.ok(db.calls.topRated >= 1, 'top-rated queried');
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('t1'));
  });

  await t.test('does not duplicate ids already present', async () => {
    const category = [skill('a'), skill('b')];
    const topRated = [skill('a'), skill('t1')]; // 'a' overlaps
    const db = makeMockDb({ category, installs: 0, topRated });
    const results = await getRelated(db, 'target', { limit: 10 });
    const ids = results.map((r) => r.id);
    const unique = new Set(ids);
    assert.strictEqual(ids.length, unique.size, 'no duplicate ids');
  });
});

test('recommendation: co-install boost (>= threshold)', async (t) => {
  await t.test('blends co-install rows when installs >= threshold', async () => {
    const category = [skill('a', { rating_avg: 3 }), skill('b', { rating_avg: 2 }), skill('c'), skill('d'), skill('e')];
    const coinstall = [skill('z', { co_install_count: 50 }), skill('a', { co_install_count: 40 })];
    const db = makeMockDb({ category, coinstall, installs: COINSTALL_THRESHOLD });
    const results = await getRelated(db, 'target', { limit: 10 });
    assert.strictEqual(db.calls.coinstall, 1, 'co-install queried at threshold');
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('z'), 'co-install-only skill surfaced via blend');
  });
});
