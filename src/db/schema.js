// Phase 9 Marketplace Database Schema Definitions

export const schema = {
  skills: {
    columns: ['id', 'name', 'category', 'description', 'icon_url', 'owner', 'manifest_json', 'status', 'created_at', 'updated_at'],
    table: 'skills',
    pk: 'id',
    indexes: ['category', 'owner', 'status', 'created_at', 'name_trgm'],
  },
  versions: {
    columns: ['id', 'skill_id', 'version_tag', 'release_date', 'changelog', 'checksum', 'status', 'created_at'],
    table: 'versions',
    pk: 'id',
    fk: { skill_id: 'skills(id)' },
    indexes: ['skill_id', 'version_tag', 'status', 'skill_tag'],
  },
  ratings: {
    columns: ['id', 'skill_id', 'user_id', 'score', 'review_text', 'created_at', 'updated_at'],
    table: 'ratings',
    pk: 'id',
    fk: { skill_id: 'skills(id)' },
    indexes: ['skill_id', 'user_id', 'score', 'created_at'],
    unique: ['skill_id, user_id'],
  },
  trending_metrics: {
    columns: ['id', 'skill_id', 'installs_7d', 'installs_30d', 'rating_avg', 'rating_count', 'trend_direction', 'calculated_at'],
    table: 'trending_metrics',
    pk: 'id',
    fk: { skill_id: 'skills(id)' },
    indexes: ['installs_7d', 'installs_30d', 'rating_avg', 'calculated_at'],
  },
  installation_log: {
    columns: ['id', 'skill_id', 'version_id', 'user_id', 'timestamp', 'status', 'error_message'],
    table: 'installation_log',
    pk: 'id',
    fk: { skill_id: 'skills(id)', version_id: 'versions(id)' },
    indexes: ['skill_id', 'version_id', 'timestamp', 'status'],
  },
};

// Helper: Insert skill
export async function insertSkill(db, { name, category, description, icon_url, owner, manifest_json }) {
  const query = `
    INSERT INTO skills (name, category, description, icon_url, owner, manifest_json)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const result = await db.query(query, [name, category, description, icon_url, owner, JSON.stringify(manifest_json)]);
  return result.rows[0];
}

// Helper: Get skill by ID
export async function getSkill(db, skillId) {
  const query = 'SELECT * FROM skills WHERE id = $1';
  const result = await db.query(query, [skillId]);
  return result.rows[0];
}

// Helper: Get skill by name
export async function getSkillByName(db, name) {
  const query = 'SELECT * FROM skills WHERE name = $1';
  const result = await db.query(query, [name]);
  return result.rows[0];
}

// Helper: List skills (paginated)
export async function listSkills(db, { category, status = 'published', limit = 50, offset = 0, sort = 'created_at' } = {}) {
  let query = 'SELECT * FROM skills WHERE status = $1';
  const params = [status];

  if (category) {
    query += ` AND category = $${params.length + 1}`;
    params.push(category);
  }

  const validSorts = ['created_at', 'updated_at', 'name'];
  const sortColumn = validSorts.includes(sort) ? sort : 'created_at';
  query += ` ORDER BY ${sortColumn} DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await db.query(query, params);
  return result.rows;
}

// Helper: Search skills by name/description
export async function searchSkills(db, searchQuery, { limit = 50, offset = 0 } = {}) {
  const query = `
    SELECT * FROM skills
    WHERE to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, '')) @@
          plainto_tsquery('english', $1)
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await db.query(query, [searchQuery, limit, offset]);
  return result.rows;
}

// Helper: Get versions for skill
export async function getVersions(db, skillId) {
  const query = 'SELECT * FROM versions WHERE skill_id = $1 ORDER BY release_date DESC';
  const result = await db.query(query, [skillId]);
  return result.rows;
}

// Helper: Get specific version
export async function getVersion(db, skillId, versionTag) {
  const query = 'SELECT * FROM versions WHERE skill_id = $1 AND version_tag = $2';
  const result = await db.query(query, [skillId, versionTag]);
  return result.rows[0];
}

// Helper: Insert version
export async function insertVersion(db, { skill_id, version_tag, release_date, changelog, checksum }) {
  const query = `
    INSERT INTO versions (skill_id, version_tag, release_date, changelog, checksum)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const result = await db.query(query, [skill_id, version_tag, release_date, changelog, checksum]);
  return result.rows[0];
}

// Helper: Get score distribution for skill (grouped counts per star value)
export async function getRatingDistribution(db, skillId) {
  const query = `
    SELECT score, COUNT(*) as count, AVG(score::numeric) as average
    FROM ratings
    WHERE skill_id = $1
    GROUP BY score
    ORDER BY score DESC
  `;
  const result = await db.query(query, [skillId]);
  return result.rows;
}

/**
 * List individual rating rows for a skill (review list), newest first.
 * @param {{query: Function}} db
 * @param {string} skillId
 * @param {{limit?: number, offset?: number}} [opts]
 * @returns {Promise<Array>} Rating rows
 */
export async function getRatings(db, skillId, { limit = 20, offset = 0 } = {}) {
  const query = `
    SELECT id, skill_id, user_id, score, review_text, created_at, updated_at
    FROM ratings
    WHERE skill_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await db.query(query, [skillId, limit, offset]);
  return result.rows;
}

/**
 * Get the calling user's own rating for a skill, if any.
 * @returns {Promise<Object|null>}
 */
export async function getUserRating(db, skillId, userId) {
  const query = `
    SELECT id, skill_id, user_id, score, review_text, created_at, updated_at
    FROM ratings
    WHERE skill_id = $1 AND user_id = $2
  `;
  const result = await db.query(query, [skillId, userId]);
  return result.rows[0] || null;
}

/**
 * Create a rating. Returns the new row, or null if the user has already
 * rated this skill (UNIQUE(skill_id,user_id) conflict -> DO NOTHING).
 * @returns {Promise<Object|null>}
 */
export async function createRating(db, { skillId, userId, score, reviewText = null }) {
  const query = `
    INSERT INTO ratings (skill_id, user_id, score, review_text)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (skill_id, user_id) DO NOTHING
    RETURNING id, skill_id, user_id, score, review_text, created_at, updated_at
  `;
  const result = await db.query(query, [skillId, userId, score, reviewText]);
  return result.rows[0] || null;
}

/**
 * Upsert a rating (edit own). Idempotent; always returns the resulting row.
 * @returns {Promise<Object>}
 */
export async function updateRating(db, { skillId, userId, score, reviewText = null }) {
  const query = `
    INSERT INTO ratings (skill_id, user_id, score, review_text)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (skill_id, user_id) DO UPDATE SET
      score = EXCLUDED.score,
      review_text = EXCLUDED.review_text,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, skill_id, user_id, score, review_text, created_at, updated_at
  `;
  const result = await db.query(query, [skillId, userId, score, reviewText]);
  return result.rows[0];
}

/**
 * List all categories for taxonomy/nav, ordered for display.
 * @returns {Promise<Array>} Category rows
 */
export async function listCategories(db) {
  const query = `
    SELECT c.id, c.slug, c.display_name, c.description, c.parent_id, c.sort_order,
           COUNT(s.id) FILTER (WHERE s.status = 'published') AS skill_count
    FROM categories c
    LEFT JOIN skills s ON s.category = c.slug
    GROUP BY c.id, c.slug, c.display_name, c.description, c.parent_id, c.sort_order
    ORDER BY c.sort_order ASC, c.display_name ASC
  `;
  const result = await db.query(query);
  return result.rows;
}

/**
 * Category-based related skills (default recommendation path). Same category,
 * excludes the target, published only, ranked by rating then 30d installs.
 * @returns {Promise<Array>} Skill rows (joined with trending metrics)
 */
export async function getRelatedSkills(db, skillId, { limit = 10 } = {}) {
  const query = `
    SELECT s.*, tm.rating_avg, tm.rating_count, tm.installs_30d
    FROM skills s
    LEFT JOIN trending_metrics tm ON tm.skill_id = s.id
    WHERE s.category = (SELECT category FROM skills WHERE id = $1)
      AND s.id <> $1
      AND s.status = 'published'
    ORDER BY tm.rating_avg DESC NULLS LAST, tm.installs_30d DESC NULLS LAST
    LIMIT $2
  `;
  const result = await db.query(query, [skillId, limit]);
  return result.rows;
}

/**
 * Global top-rated published skills (sparsity fallback for related section).
 * @returns {Promise<Array>} Skill rows
 */
export async function getTopRatedSkills(db, { limit = 10, excludeIds = [] } = {}) {
  const params = [limit];
  let exclusion = '';
  if (excludeIds.length > 0) {
    exclusion = `AND s.id <> ALL($2::uuid[])`;
    params.push(excludeIds);
  }
  const query = `
    SELECT s.*, tm.rating_avg, tm.rating_count, tm.installs_30d
    FROM skills s
    LEFT JOIN trending_metrics tm ON tm.skill_id = s.id
    WHERE s.status = 'published' ${exclusion}
    ORDER BY tm.rating_avg DESC NULLS LAST, tm.installs_30d DESC NULLS LAST
    LIMIT $1
  `;
  const result = await db.query(query, params);
  return result.rows;
}

/**
 * Count successful installs for a skill (co-install threshold check).
 * @returns {Promise<number>}
 */
export async function countInstalls(db, skillId) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM installation_log
     WHERE skill_id = $1 AND status = 'success'`,
    [skillId]
  );
  return result.rows[0]?.count || 0;
}

/**
 * Co-install set: skills most frequently installed by users who also installed
 * the target skill, ranked by distinct co-occurring user count.
 * @returns {Promise<Array>} Skill rows + co_install_count
 */
export async function getCoInstalledSkills(db, skillId, { limit = 10 } = {}) {
  const query = `
    SELECT s.*, tm.rating_avg, tm.rating_count, tm.installs_30d,
           COUNT(DISTINCT other.user_id) AS co_install_count
    FROM installation_log other
    JOIN skills s ON s.id = other.skill_id
    LEFT JOIN trending_metrics tm ON tm.skill_id = s.id
    WHERE other.status = 'success'
      AND other.skill_id <> $1
      AND s.status = 'published'
      AND other.user_id IN (
        SELECT DISTINCT user_id FROM installation_log
        WHERE skill_id = $1 AND status = 'success' AND user_id IS NOT NULL
      )
    GROUP BY s.id, tm.rating_avg, tm.rating_count, tm.installs_30d
    ORDER BY co_install_count DESC, tm.rating_avg DESC NULLS LAST
    LIMIT $2
  `;
  const result = await db.query(query, [skillId, limit]);
  return result.rows;
}

/**
 * Set-based nightly trending refresh. Computes installs_7d, installs_30d,
 * prev_7d, rating aggregates, trend_direction and trend_score for ALL skills
 * in a single statement (no per-skill N+1), then upserts trending_metrics.
 * @returns {Promise<{updated: number}>}
 */
export async function refreshTrendingBatch(db) {
  const query = `
    WITH windows AS (
      SELECT
        s.id AS skill_id,
        COUNT(il.id) FILTER (
          WHERE il.status = 'success' AND il.timestamp >= NOW() - INTERVAL '7 days'
        ) AS installs_7d,
        COUNT(il.id) FILTER (
          WHERE il.status = 'success' AND il.timestamp >= NOW() - INTERVAL '30 days'
        ) AS installs_30d,
        COUNT(il.id) FILTER (
          WHERE il.status = 'success'
            AND il.timestamp >= NOW() - INTERVAL '14 days'
            AND il.timestamp <  NOW() - INTERVAL '7 days'
        ) AS prev_7d
      FROM skills s
      LEFT JOIN installation_log il ON il.skill_id = s.id
      GROUP BY s.id
    ),
    ratings_agg AS (
      SELECT skill_id, AVG(score::numeric) AS rating_avg, COUNT(*) AS rating_count
      FROM ratings GROUP BY skill_id
    ),
    computed AS (
      SELECT
        w.skill_id,
        w.installs_7d,
        w.installs_30d,
        COALESCE(ra.rating_avg, 0) AS rating_avg,
        COALESCE(ra.rating_count, 0) AS rating_count,
        CASE
          WHEN w.installs_7d > w.prev_7d THEN 'up'
          WHEN w.installs_7d < w.prev_7d THEN 'down'
          ELSE 'stable'
        END AS trend_direction,
        -- trend_score = installs_7d * log2(1 + installs_7d / max(installs_30d/30*7, 1))
        (w.installs_7d * (
          ln(1 + w.installs_7d::numeric / GREATEST((w.installs_30d::numeric / 30) * 7, 1)) / ln(2)
        ))::numeric(12,4) AS trend_score
      FROM windows w
      LEFT JOIN ratings_agg ra ON ra.skill_id = w.skill_id
    )
    INSERT INTO trending_metrics
      (skill_id, installs_7d, installs_30d, rating_avg, rating_count, trend_direction, trend_score, calculated_at)
    SELECT
      skill_id, installs_7d, installs_30d, rating_avg, rating_count, trend_direction, trend_score, NOW()
    FROM computed
    ON CONFLICT (skill_id) DO UPDATE SET
      installs_7d     = EXCLUDED.installs_7d,
      installs_30d    = EXCLUDED.installs_30d,
      rating_avg      = EXCLUDED.rating_avg,
      rating_count    = EXCLUDED.rating_count,
      trend_direction = EXCLUDED.trend_direction,
      trend_score     = EXCLUDED.trend_score,
      calculated_at   = EXCLUDED.calculated_at
    RETURNING skill_id
  `;
  const result = await db.query(query);
  return { updated: result.rowCount };
}

// Helper: Get rating average for skill
export async function getRatingAverage(db, skillId) {
  const query = `
    SELECT AVG(score::numeric) as average, COUNT(*) as count
    FROM ratings
    WHERE skill_id = $1
  `;
  const result = await db.query(query, [skillId]);
  const row = result.rows[0];
  return {
    average: row.average ? parseFloat(row.average) : null,
    count: parseInt(row.count),
  };
}

// Helper: Insert rating
export async function insertRating(db, { skill_id, user_id, score, review_text }) {
  const query = `
    INSERT INTO ratings (skill_id, user_id, score, review_text)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (skill_id, user_id) DO UPDATE SET
      score = $3,
      review_text = $4,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await db.query(query, [skill_id, user_id, score, review_text]);
  return result.rows[0];
}

// Helper: Get trending metrics
export async function getTrendingMetrics(db, { window = '30d', limit = 50 } = {}) {
  // Velocity-ranked (trend_score) so accelerating skills surface over raw
  // volume; tie-break on the window's raw install count for determinism.
  const tieColumn = window === '7d' ? 'installs_7d' : 'installs_30d';
  const query = `
    SELECT tm.*, s.name, s.category
    FROM trending_metrics tm
    JOIN skills s ON tm.skill_id = s.id
    ORDER BY tm.trend_score DESC NULLS LAST, tm.${tieColumn} DESC
    LIMIT $1
  `;
  const result = await db.query(query, [limit]);
  return result.rows;
}

// Helper: Update trending metrics
export async function updateTrendingMetrics(db, { skill_id, installs_7d, installs_30d, rating_avg, rating_count }) {
  const query = `
    INSERT INTO trending_metrics (skill_id, installs_7d, installs_30d, rating_avg, rating_count, calculated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT (skill_id) DO UPDATE SET
      installs_7d = $2,
      installs_30d = $3,
      rating_avg = $4,
      rating_count = $5,
      calculated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await db.query(query, [skill_id, installs_7d, installs_30d, rating_avg, rating_count]);
  return result.rows[0];
}

// Helper: Log installation
export async function logInstallation(db, { skill_id, version_id, user_id, status = 'success', error_message = null }) {
  const query = `
    INSERT INTO installation_log (skill_id, version_id, user_id, status, error_message)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const result = await db.query(query, [skill_id, version_id, user_id, status, error_message]);
  return result.rows[0];
}
