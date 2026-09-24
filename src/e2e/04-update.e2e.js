// E2E Scenario 04 — UPDATE (publish new version, pin re-resolves)
// Flow: a skill publishes a new minor version; a caret pin that previously
// resolved to the old version now resolves to the new one. Exercises version
// publish + GET /skills/:id/resolve and GET /skills/:id/versions.

export default {
  name: '04-update',
  async run(ctx) {
    const { createContext, teardown, seedSkill, seedVersion, makeRunId, expect } = ctx;
    const runId = makeRunId();
    const c = await createContext();
    try {
      // Arrange — skill at 1.0.0 only.
      const skill = await seedSkill(c.db, runId, { name: `${runId}-updatable` });
      await seedVersion(c.db, skill.id, '1.0.0');

      // Before update: ^1.0.0 resolves to 1.0.0.
      const before = await c.client.get(
        `/api/v1/skills/${skill.id}/resolve?constraint=${encodeURIComponent('^1.0.0')}`
      );
      expect('before 200', before.status === 200);
      expect('before resolves 1.0.0', before.body.data.resolved === '1.0.0', `got ${before.body.data.resolved}`);

      // Act — publish 1.1.0 (new minor, within the caret range).
      await seedVersion(c.db, skill.id, '1.1.0');

      // Also publish 2.0.0 to prove the caret upper bound still holds.
      await seedVersion(c.db, skill.id, '2.0.0');

      // Assert — the same pin now resolves to 1.1.0 (highest <2.0.0).
      const after = await c.client.get(
        `/api/v1/skills/${skill.id}/resolve?constraint=${encodeURIComponent('^1.0.0')}`
      );
      expect('after 200', after.status === 200);
      expect(
        'after resolves 1.1.0',
        after.body.data.resolved === '1.1.0',
        `expected 1.1.0 (not 2.0.0), got ${after.body.data.resolved}`
      );

      // An exact pin to the old version still resolves to it.
      const exact = await c.client.get(
        `/api/v1/skills/${skill.id}/resolve?constraint=${encodeURIComponent('1.0.0')}`
      );
      expect('exact 200', exact.status === 200);
      expect('exact resolves 1.0.0', exact.body.data.resolved === '1.0.0');

      // Versions listing now shows all three.
      const versions = await c.client.get(`/api/v1/skills/${skill.id}/versions`);
      expect('versions 200', versions.status === 200);
      const tags = versions.body.data.map((v) => v.version_tag).sort();
      expect('all three versions', tags.join(',') === '1.0.0,1.1.0,2.0.0', `got ${tags.join(',')}`);
    } finally {
      await teardown(c.db, runId);
      await c.close();
    }
  },
};
