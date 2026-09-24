// Phase 9 Analytics Service
// Handles installation logging and trending metrics aggregation

import * as schema from '../db/schema.js';

export class AnalyticsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export async function logInstall(db, { skillId, versionId, userId, status = 'success', errorMessage = null }) {
  if (!skillId) {
    throw new AnalyticsError('skillId is required');
  }
  if (!userId) {
    throw new AnalyticsError('userId is required');
  }

  try {
    const entry = await schema.logInstallation(db, {
      skill_id: skillId,
      version_id: versionId || null,
      user_id: userId,
      status,
      error_message: errorMessage,
    });
    return entry;
  } catch (error) {
    throw new AnalyticsError(`Failed to log installation: ${error.message}`);
  }
}

export async function updateTrendingForSkill(db, skillId) {
  if (!skillId) {
    throw new AnalyticsError('skillId is required');
  }

  try {
    const skill = await schema.getSkill(db, skillId);
    if (!skill) {
      throw new AnalyticsError(`Skill not found: ${skillId}`);
    }

    // Count installations from last 7 days
    const result7d = await db.query(
      `SELECT COUNT(*) as count FROM installation_log
       WHERE skill_id = $1 AND status = 'success' AND timestamp >= NOW() - INTERVAL '7 days'`,
      [skillId]
    );
    const installs7d = parseInt(result7d.rows[0].count, 10) || 0;

    // Count installations from last 30 days
    const result30d = await db.query(
      `SELECT COUNT(*) as count FROM installation_log
       WHERE skill_id = $1 AND status = 'success' AND timestamp >= NOW() - INTERVAL '30 days'`,
      [skillId]
    );
    const installs30d = parseInt(result30d.rows[0].count, 10) || 0;

    // Get rating average
    const ratingAvg = await schema.getRatingAverage(db, skillId);

    // Determine trend direction
    const resultPrev7d = await db.query(
      `SELECT COUNT(*) as count FROM installation_log
       WHERE skill_id = $1 AND status = 'success'
       AND timestamp >= NOW() - INTERVAL '14 days'
       AND timestamp < NOW() - INTERVAL '7 days'`,
      [skillId]
    );
    const installs7dPrev = parseInt(resultPrev7d.rows[0].count, 10) || 0;
    const trendDirection = installs7d > installs7dPrev ? 'up' : installs7d < installs7dPrev ? 'down' : 'stable';

    // Update metrics
    const metrics = await schema.updateTrendingMetrics(db, {
      skill_id: skillId,
      installs_7d: installs7d,
      installs_30d: installs30d,
      rating_avg: ratingAvg.average || 0,
      rating_count: ratingAvg.count,
      trend_direction: trendDirection,
    });

    return metrics;
  } catch (error) {
    throw new AnalyticsError(`Failed to update trending metrics: ${error.message}`);
  }
}

export async function getBatchTrending(db, { window = '30d', limit = 50 } = {}) {
  try {
    const trending = await schema.getTrendingMetrics(db, { window, limit });
    return trending;
  } catch (error) {
    throw new AnalyticsError(`Failed to fetch trending: ${error.message}`);
  }
}

export async function getInstallStats(db, skillId, { days = 30 } = {}) {
  if (!skillId) {
    throw new AnalyticsError('skillId is required');
  }

  try {
    const result = await db.query(
      `SELECT DATE(timestamp) as date, COUNT(*) as count,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
       FROM installation_log
       WHERE skill_id = $1 AND timestamp >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(timestamp)
       ORDER BY date DESC`,
      [skillId]
    );
    return result.rows;
  } catch (error) {
    throw new AnalyticsError(`Failed to fetch install stats: ${error.message}`);
  }
}

export async function getInstallSuccess(db, skillId) {
  if (!skillId) {
    throw new AnalyticsError('skillId is required');
  }

  try {
    const result = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
       FROM installation_log
       WHERE skill_id = $1`,
      [skillId]
    );
    const row = result.rows[0];
    const total = parseInt(row.total, 10) || 0;
    const successes = parseInt(row.successes, 10) || 0;
    const rate = total > 0 ? (successes / total * 100).toFixed(2) : 0;

    return {
      total,
      successes,
      failures: parseInt(row.failures, 10) || 0,
      successRate: parseFloat(rate),
    };
  } catch (error) {
    throw new AnalyticsError(`Failed to calculate success rate: ${error.message}`);
  }
}
