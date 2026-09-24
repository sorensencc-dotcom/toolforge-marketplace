// E2E Scenario 01 — DISCOVER
// Flow: a user browses the marketplace: list, search, filter by category, and
// open a skill detail. Exercises GET /api/v1/skills, /skills/search,
// /skills?category=, /skills/:id.

export default {
  name: '01-discover',
  async run(ctx) {
    const { createContext, teardown, seedSkill, makeRunId, expect } = ctx;
    const runId = makeRunId();
    const c = await createContext();
    try {
      // Arrange — seed skills across two categories with a searchable term.
      const uniqueTerm = `zephyrlint${runId.slice(-6)}`;
      const a = await seedSkill(c.db, runId, {
        name: `${runId}-alpha`,
        category: `${runId}-automation`,
        description: `An ${uniqueTerm} automation helper`,
      });
      await seedSkill(c.db, runId, {
        name: `${runId}-beta`,
        category: `${runId}-automation`,
        description: 'A second automation helper',
      });
      await seedSkill(c.db, runId, {
        name: `${runId}-gamma`,
        category: `${runId}-linting`,
        description: 'A linting helper',
      });

      // Act + Assert — list returns published skills.
      const list = await c.client.get('/api/v1/skills?limit=100');
      expect('list 200', list.status === 200, `got ${list.status}`);
      expect('list is array', Array.isArray(list.body.data));

      // Filter by category — only the two automation skills for this run.
      const filtered = await c.client.get(
        `/api/v1/skills?category=${encodeURIComponent(`${runId}-automation`)}&limit=100`
      );
      expect('filter 200', filtered.status === 200);
      const mine = filtered.body.data.filter((s) => s.owner === `${runId}@e2e.local`);
      expect('filter category count', mine.length === 2, `expected 2 got ${mine.length}`);
      mine.forEach((s) =>
        expect('filter category match', s.category === `${runId}-automation`, s.category)
      );

      // Full-text search finds the unique term (only skill alpha).
      const search = await c.client.get(`/api/v1/skills/search?q=${uniqueTerm}`);
      expect('search 200', search.status === 200);
      const hit = search.body.data.find((s) => s.id === a.id);
      expect('search hit', !!hit, `unique term ${uniqueTerm} not found`);

      // Detail — open skill alpha, expect rating envelope present.
      const detail = await c.client.get(`/api/v1/skills/${a.id}`);
      expect('detail 200', detail.status === 200);
      expect('detail id', detail.body.data.id === a.id);
      expect('detail rating envelope', detail.body.data.rating !== undefined);

      // Detail — unknown id 404.
      const missing = await c.client.get('/api/v1/skills/00000000-0000-4000-8000-000000000000');
      expect('detail missing 404', missing.status === 404, `got ${missing.status}`);
    } finally {
      await teardown(c.db, runId);
      await c.close();
    }
  },
};
