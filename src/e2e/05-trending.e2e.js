// E2E Scenario 05 — TRENDING RECALC
// Flow: installs accumulate; the nightly batch recalculates trending_metrics;
// GET /api/v1/skills/trending reflects the spike. A skill with a burst of recent
// installs must outrank a flat-baseline skill after the recalc.
//
// NOTE: assumes a dedicated / low-volume test database (standard for E2E) so the
// seeded skills surface within the trending top-N.

import { runTrendingRefresh } from '../services/trending-batch.js';

export default {
  name: '05-trending',
  async run(ctx) {
    const { createContext, teardown, seedSkill, seedVersion, seedInstalls, makeRunId, expect } = ctx;
    const runId = makeRunId();
    const c = await createContext();
    try {
      // Arrange — a spiking skill and a flat-baseline skill.
      const spike = await seedSkill(c.db, runId, { name: `${runId}-spike` });
      const flat = await seedSkill(c.db, runId, { name: `${runId}-flat` });
      const vSpike = await seedVersion(c.db, spike.id, '1.0.0');
      const vFlat = await seedVersion(c.db, flat.id, '1.0.0');

      // Spike: 40 installs in the last 7d, only 2 in the prior 7d window (accel).
      await seedInstalls(c.db, spike.id, vSpike.id, `${runId}s7`, 40, { daysAgo: 1 });
      await seedInstalls(c.db, spike.id, vSpike.id, `${runId}sp`, 2, { daysAgo: 10 });

      // Flat: 6 installs in the last 7d, 6 in the prior 7d window (stable).
      await seedInstalls(c.db, flat.id, vFlat.id, `${runId}f7`, 6, { daysAgo: 1 });
      await seedInstalls(c.db, flat.id, vFlat.id, `${runId}fp`, 6, { daysAgo: 10 });

      // Act — run the set-based nightly refresh (scheduler entrypoint logic).
      const refresh = await runTrendingRefresh(c.db);
      expect('refresh updated >0', refresh.skillsUpdated > 0, `updated ${refresh.skillsUpdated}`);

      // Assert (DB) — the spike row recalculated: up, positive trend_score.
      const spikeRow = await c.db.query(
        `SELECT installs_7d, trend_direction, trend_score FROM trending_metrics WHERE skill_id = $1`,
        [spike.id]
      );
      expect('spike metrics exist', spikeRow.rows.length === 1);
      expect('spike installs_7d = 40', Number(spikeRow.rows[0].installs_7d) === 40, `got ${spikeRow.rows[0].installs_7d}`);
      expect('spike direction up', spikeRow.rows[0].trend_direction === 'up', spikeRow.rows[0].trend_direction);
      expect('spike score > 0', Number(spikeRow.rows[0].trend_score) > 0);

      // Assert (API) — trending endpoint reflects the spike and ranks it above flat.
      const trending = await c.client.get('/api/v1/skills/trending?window=7d&limit=100');
      expect('trending 200', trending.status === 200, `got ${trending.status}`);
      expect('trending is array', Array.isArray(trending.body.data));

      const idxSpike = trending.body.data.findIndex((t) => t.id === spike.id);
      const idxFlat = trending.body.data.findIndex((t) => t.id === flat.id);
      expect('spike present in trending', idxSpike !== -1, 'spiking skill missing from top-100');
      expect('flat present in trending', idxFlat !== -1, 'flat skill missing from top-100');
      expect('spike outranks flat', idxSpike < idxFlat, `spike@${idxSpike} flat@${idxFlat}`);

      const spikeItem = trending.body.data[idxSpike];
      expect('spike trendScore > 0 via API', spikeItem.trendScore > 0);
      expect('spike trendDirection up via API', spikeItem.trendDirection === 'up');
    } finally {
      await teardown(c.db, runId);
      await c.close();
    }
  },
};
