// Response serializers. Map snake_case DB rows to the frozen camelCase API
// contract (design doc §7 typedefs; matches src/ui/fixtures/*.json). Keep the
// boundary here so DB column names never leak into the public response shape.

function num(v, fallback = null) {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** @returns {{id, skillId, userId, score, reviewText, createdAt, updatedAt}} */
export function toRating(row) {
  return {
    id: row.id,
    skillId: row.skill_id,
    userId: row.user_id,
    score: row.score,
    reviewText: row.review_text ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** @returns {{id, slug, displayName, description, parentId, sortOrder, skillCount?}} */
export function toCategory(row) {
  const out = {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description ?? null,
    parentId: row.parent_id ?? null,
    sortOrder: row.sort_order,
  };
  if (row.skill_count !== undefined && row.skill_count !== null) {
    out.skillCount = num(row.skill_count, 0);
  }
  return out;
}

/**
 * Skill summary (related-skills contract): core fields + nested rating.
 * @returns {{id, name, description, category, owner, status, iconUrl, rating:{average,count}, installs30d}}
 */
export function toSkillSummary(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    category: row.category,
    owner: row.owner,
    status: row.status,
    iconUrl: row.icon_url ?? null,
    rating: {
      average: num(row.rating_avg, null),
      count: num(row.rating_count, 0),
    },
    installs30d: num(row.installs_30d, 0),
  };
}

/**
 * Trending item contract. growthPct is not persisted (derived UI concern);
 * trendScore and window install counts are the ranking-relevant fields.
 * @returns {{id, name, category, installs7d, installs30d, trendDirection, trendScore, rating:{average,count}}}
 */
export function toTrendingItem(row) {
  return {
    id: row.skill_id,
    name: row.name,
    category: row.category,
    installs7d: num(row.installs_7d, 0),
    installs30d: num(row.installs_30d, 0),
    trendDirection: row.trend_direction ?? 'stable',
    trendScore: num(row.trend_score, 0),
    rating: {
      average: num(row.rating_avg, null),
      count: num(row.rating_count, 0),
    },
  };
}
