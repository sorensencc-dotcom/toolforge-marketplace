// Phase 9 Trending Batch Service
// Nightly scheduler entrypoint (npm run trending:refresh). Set-based refresh of
// trending_metrics for ALL skills in a single SQL statement (no per-skill N+1).

import { fileURLToPath } from 'url';
import { refreshTrendingBatch } from '../db/schema.js';

export class TrendingBatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrendingBatchError';
  }
}

/**
 * Pure spike-score computation (velocity x volume). Must match the SQL in
 * refreshTrendingBatch so unit tests can pin the formula.
 *   baseline_daily = installs30d / 30
 *   expected_7d    = max(baseline_daily * 7, 1)     // floor avoids div-by-zero
 *   spike_ratio    = installs7d / expected_7d       // >1 = accelerating
 *   trend_score    = installs7d * log2(1 + spike_ratio)
 * @param {{installs7d:number, installs30d:number, prev7d?:number}} args
 * @returns {number} trend score (>= 0)
 */
export function computeSpikeScore({ installs7d = 0, installs30d = 0, prev7d = 0 } = {}) {
  const i7 = Math.max(0, Number(installs7d) || 0);
  const i30 = Math.max(0, Number(installs30d) || 0);
  // prev7d is not part of the score (it drives trend_direction); accepted for
  // a stable signature and validated as non-negative.
  void Math.max(0, Number(prev7d) || 0);

  if (i7 === 0) return 0;

  const baselineDaily = i30 / 30;
  const expected7d = Math.max(baselineDaily * 7, 1);
  const spikeRatio = i7 / expected7d;
  return i7 * Math.log2(1 + spikeRatio);
}

/**
 * Run the full set-based trending refresh.
 * @param {{query: Function}} db
 * @returns {Promise<{skillsUpdated:number, durationMs:number}>}
 * @throws {TrendingBatchError}
 */
export async function runTrendingRefresh(db) {
  const start = Date.now();
  try {
    const { updated } = await refreshTrendingBatch(db);
    return { skillsUpdated: updated, durationMs: Date.now() - start };
  } catch (error) {
    throw new TrendingBatchError(`Trending refresh failed: ${error.message}`);
  }
}

// Scheduler entrypoint: `npm run trending:refresh` (wire to Windows Task
// Scheduler at 00:00 UTC via the Schedule.Service COM approach).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { pool } = await import('../db/connect.js');
  const db = { query: (text, params) => pool.query(text, params) };
  try {
    const result = await runTrendingRefresh(db);
    console.log(`Trending refresh complete: ${result.skillsUpdated} skills in ${result.durationMs}ms`);
    await pool.end();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
