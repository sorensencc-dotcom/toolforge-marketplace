-- Phase 9 Wave C: Category taxonomy + ratings/trending hardening
-- Created: 2026-07-14
-- Target: PostgreSQL 15+
-- Extends 0001_create_marketplace_schema.sql

-- Categories reference table (2-level taxonomy via nullable parent_id).
-- skills.category (VARCHAR) stays the denormalized primary category; this
-- table is the lookup/nav surface and validation source for category slugs.
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Velocity-ranked trend score (installs x acceleration). Ordered by the
-- trending endpoint; populated by the set-based nightly refresh.
ALTER TABLE trending_metrics ADD COLUMN IF NOT EXISTS trend_score NUMERIC(12, 4) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_trending_trend_score ON trending_metrics(trend_score DESC);

-- Supports the related-skills category query (category + status + rank).
CREATE INDEX IF NOT EXISTS idx_skills_category_status ON skills(category, status);

-- Supports co-install co-occurrence lookups over the install log.
CREATE INDEX IF NOT EXISTS idx_installation_log_user_skill ON installation_log(user_id, skill_id);

-- Backfill categories from the distinct set of existing skill categories.
-- display_name is a humanized slug ("code-review" -> "Code Review"); can be
-- curated later. Idempotent via ON CONFLICT on the unique slug.
INSERT INTO categories (slug, display_name, sort_order)
SELECT
  category AS slug,
  initcap(replace(replace(category, '-', ' '), '_', ' ')) AS display_name,
  0 AS sort_order
FROM (SELECT DISTINCT category FROM skills WHERE category IS NOT NULL) AS distinct_categories
ON CONFLICT (slug) DO NOTHING;
