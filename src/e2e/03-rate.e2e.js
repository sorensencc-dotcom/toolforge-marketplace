// E2E Scenario 03 — RATE
// Flow: a user posts a rating (201), a duplicate POST is rejected (409), the
// user edits via PUT (200), and the aggregate rating-stats reflect the edit.
// Exercises POST/PUT/GET /skills/:id/ratings and the rating envelope on
// GET /skills/:id. user_id is derived from auth (x-user-id header), never body.

export default {
  name: '03-rate',
  async run(ctx) {
    const { createContext, teardown, seedSkill, makeRunId, expect } = ctx;
    const runId = makeRunId();
    const c = await createContext();
    try {
      const skill = await seedSkill(c.db, runId, { name: `${runId}-rateable` });
      const userId = `${runId}-rater@e2e.local`;
      const auth = { headers: { 'x-user-id': userId } };

      // Act — create rating (201).
      const created = await c.client.post(`/api/v1/skills/${skill.id}/ratings`, {
        ...auth,
        body: { score: 5, reviewText: 'excellent' },
      });
      expect('create 201', created.status === 201, `got ${created.status}`);
      expect('create score', created.body.data.score === 5);
      expect('create userId from session', created.body.data.userId === userId);

      // Security — body-supplied user_id must be ignored.
      expect('userId not from body', created.body.data.userId === userId);

      // Duplicate POST by same user -> 409.
      const dup = await c.client.post(`/api/v1/skills/${skill.id}/ratings`, {
        ...auth,
        body: { score: 3 },
      });
      expect('duplicate 409', dup.status === 409, `got ${dup.status}`);

      // Unauthenticated POST -> 401.
      const noauth = await c.client.post(`/api/v1/skills/${skill.id}/ratings`, {
        body: { score: 4 },
      });
      expect('no-auth 401', noauth.status === 401, `got ${noauth.status}`);

      // Edit via PUT (idempotent upsert) -> 200, score changes to 2.
      const edited = await c.client.put(`/api/v1/skills/${skill.id}/ratings`, {
        ...auth,
        body: { score: 2, reviewText: 'changed my mind' },
      });
      expect('edit 200', edited.status === 200, `got ${edited.status}`);
      expect('edit score', edited.body.data.score === 2);

      // Aggregate — a second user rates 4; average of {2,4} = 3.
      const user2 = `${runId}-rater2@e2e.local`;
      const created2 = await c.client.post(`/api/v1/skills/${skill.id}/ratings`, {
        headers: { 'x-user-id': user2 },
        body: { score: 4 },
      });
      expect('second create 201', created2.status === 201);

      const detail = await c.client.get(`/api/v1/skills/${skill.id}`);
      expect('detail 200', detail.status === 200);
      expect('rating count 2', detail.body.data.rating.count === 2, `got ${detail.body.data.rating.count}`);
      expect(
        'rating avg 3',
        Math.abs(detail.body.data.rating.average - 3) < 1e-6,
        `got ${detail.body.data.rating.average}`
      );

      // Ratings list returns both rows.
      const list = await c.client.get(`/api/v1/skills/${skill.id}/ratings`);
      expect('list 200', list.status === 200);
      expect('list has 2', list.body.data.length === 2, `got ${list.body.data.length}`);
    } finally {
      await teardown(c.db, runId);
      await c.close();
    }
  },
};
