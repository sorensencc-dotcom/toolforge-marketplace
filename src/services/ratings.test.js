import test from 'node:test';
import assert from 'node:assert';
import { submitRating, RatingError, REVIEW_TEXT_MAX } from './ratings.js';

// Mock db that emulates the ratings table's ON CONFLICT semantics.
// createRating -> INSERT ... ON CONFLICT DO NOTHING RETURNING *
// updateRating -> INSERT ... ON CONFLICT DO UPDATE ... RETURNING *
function makeMockDb() {
  const store = new Map(); // key `${skillId}:${userId}` -> row
  let seq = 1;
  return {
    store,
    query: async (text, params) => {
      const [skillId, userId, score, reviewText] = params;
      const key = `${skillId}:${userId}`;
      if (text.includes('DO NOTHING')) {
        if (store.has(key)) return { rows: [] }; // conflict -> no row
        const row = { id: `r${seq++}`, skill_id: skillId, user_id: userId, score, review_text: reviewText, created_at: 'now', updated_at: 'now' };
        store.set(key, row);
        return { rows: [row] };
      }
      if (text.includes('DO UPDATE')) {
        const existing = store.get(key);
        const row = existing
          ? { ...existing, score, review_text: reviewText, updated_at: 'later' }
          : { id: `r${seq++}`, skill_id: skillId, user_id: userId, score, review_text: reviewText, created_at: 'now', updated_at: 'now' };
        store.set(key, row);
        return { rows: [row] };
      }
      return { rows: [] };
    },
  };
}

test('ratings: validation', async (t) => {
  const db = makeMockDb();

  await t.test('missing skillId -> 400', async () => {
    await assert.rejects(
      () => submitRating(db, { userId: 'u1', score: 5 }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 400
    );
  });

  await t.test('missing userId -> 401 (auth boundary)', async () => {
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', score: 5 }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 401
    );
  });

  await t.test('score below range -> 400', async () => {
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', userId: 'u1', score: 0 }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 400
    );
  });

  await t.test('score above range -> 400', async () => {
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', userId: 'u1', score: 6 }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 400
    );
  });

  await t.test('non-integer score -> 400', async () => {
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', userId: 'u1', score: 3.5 }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 400
    );
  });

  await t.test('overlong reviewText -> 400', async () => {
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', userId: 'u1', score: 4, reviewText: 'x'.repeat(REVIEW_TEXT_MAX + 1) }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 400
    );
  });

  await t.test('invalid mode -> 400', async () => {
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', userId: 'u1', score: 4 }, { mode: 'bogus' }),
      (e) => e instanceof RatingError && e.status === 400
    );
  });
});

test('ratings: create + edit outcomes', async (t) => {
  await t.test('first create returns {created:true}', async () => {
    const db = makeMockDb();
    const res = await submitRating(db, { skillId: 's1', userId: 'u1', score: 5 }, { mode: 'create' });
    assert.strictEqual(res.created, true);
    assert.strictEqual(res.rating.score, 5);
  });

  await t.test('duplicate create -> 409', async () => {
    const db = makeMockDb();
    await submitRating(db, { skillId: 's1', userId: 'u1', score: 5 }, { mode: 'create' });
    await assert.rejects(
      () => submitRating(db, { skillId: 's1', userId: 'u1', score: 3 }, { mode: 'create' }),
      (e) => e instanceof RatingError && e.status === 409
    );
  });

  await t.test('edit upserts -> {created:false}', async () => {
    const db = makeMockDb();
    await submitRating(db, { skillId: 's1', userId: 'u1', score: 5 }, { mode: 'create' });
    const res = await submitRating(db, { skillId: 's1', userId: 'u1', score: 2 }, { mode: 'edit' });
    assert.strictEqual(res.created, false);
    assert.strictEqual(res.rating.score, 2);
  });
});

test('ratings: concurrency (concurrent POST -> one 201, one 409)', async (t) => {
  await t.test('two concurrent creates: exactly one succeeds', async () => {
    const db = makeMockDb();
    const results = await Promise.allSettled([
      submitRating(db, { skillId: 's1', userId: 'u1', score: 5 }, { mode: 'create' }),
      submitRating(db, { skillId: 's1', userId: 'u1', score: 4 }, { mode: 'create' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof RatingError && r.reason.status === 409
    );

    assert.strictEqual(fulfilled.length, 1, 'exactly one create succeeds');
    assert.strictEqual(conflicts.length, 1, 'the loser gets a 409');
    assert.strictEqual(fulfilled[0].value.created, true);
  });
});
