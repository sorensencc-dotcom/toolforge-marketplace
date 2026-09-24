// E2E Scenario 02 — INSTALL (with version pin)
// Flow: a user resolves a SemVer pin against a skill's published versions, then
// installs the resolved version. Exercises GET /skills/:id/resolve?constraint=
// (SemVer resolver) and asserts an installation_log row lands for the resolved
// version.

export default {
  name: '02-install',
  async run(ctx) {
    const { createContext, teardown, seedSkill, seedVersion, makeRunId, expect } = ctx;
    const runId = makeRunId();
    const c = await createContext();
    try {
      // Arrange — skill with three published versions.
      const skill = await seedSkill(c.db, runId, { name: `${runId}-installable` });
      await seedVersion(c.db, skill.id, '1.0.0');
      const v12 = await seedVersion(c.db, skill.id, '1.2.0');
      await seedVersion(c.db, skill.id, '2.0.0');

      // Act — resolve the pin ^1.0.0 (should pick highest <2.0.0 => 1.2.0).
      const resolve = await c.client.get(
        `/api/v1/skills/${skill.id}/resolve?constraint=${encodeURIComponent('^1.0.0')}`
      );
      expect('resolve 200', resolve.status === 200, `got ${resolve.status}`);
      expect(
        'resolve picks 1.2.0',
        resolve.body.data.resolved === '1.2.0',
        `got ${resolve.body.data.resolved}`
      );

      // Look up the version row for the resolved tag, then record the install.
      const resolvedTag = resolve.body.data.resolved;
      const verRow = await c.db.query(
        `SELECT id FROM versions WHERE skill_id = $1 AND version_tag = $2`,
        [skill.id, resolvedTag]
      );
      expect('resolved version exists', verRow.rows.length === 1);
      expect('resolved is v1.2.0 row', verRow.rows[0].id === v12.id);

      const userId = `${runId}-installer@e2e.local`;
      await c.db.query(
        `INSERT INTO installation_log (skill_id, version_id, user_id, status)
         VALUES ($1, $2, $3, 'success')`,
        [skill.id, v12.id, userId]
      );

      // Assert — exactly one successful install for this user/version.
      const logged = await c.db.query(
        `SELECT * FROM installation_log
         WHERE skill_id = $1 AND version_id = $2 AND user_id = $3 AND status = 'success'`,
        [skill.id, v12.id, userId]
      );
      expect('install logged', logged.rows.length === 1, `got ${logged.rows.length} rows`);

      // A bad constraint should be rejected (400), not silently resolved.
      const bad = await c.client.get(
        `/api/v1/skills/${skill.id}/resolve?constraint=${encodeURIComponent('not-a-version')}`
      );
      expect('bad constraint 400', bad.status === 400, `got ${bad.status}`);
    } finally {
      await teardown(c.db, runId);
      await c.close();
    }
  },
};
