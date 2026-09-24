-- Phase 9: Marketplace Database Schema
-- Created: 2026-07-14
-- Target: PostgreSQL 15+

-- Required for gin_trgm_ops indexes below
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Skills table: core skill metadata
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url VARCHAR(2048),
  owner VARCHAR(255) NOT NULL,
  manifest_json JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'published',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_owner ON skills(owner);
CREATE INDEX idx_skills_status ON skills(status);
CREATE INDEX idx_skills_created_at ON skills(created_at DESC);
CREATE INDEX idx_skills_name_trgm ON skills USING gin(name gin_trgm_ops);

-- Versions table: skill version history
CREATE TABLE IF NOT EXISTS versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_tag VARCHAR(50) NOT NULL,
  release_date TIMESTAMP WITH TIME ZONE NOT NULL,
  changelog TEXT,
  checksum VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'published',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_versions_skill_id ON versions(skill_id);
CREATE INDEX idx_versions_version_tag ON versions(version_tag);
CREATE INDEX idx_versions_status ON versions(status);
CREATE UNIQUE INDEX idx_versions_skill_tag ON versions(skill_id, version_tag);

-- Ratings table: user reviews and scores
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  review_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(skill_id, user_id)
);

CREATE INDEX idx_ratings_skill_id ON ratings(skill_id);
CREATE INDEX idx_ratings_user_id ON ratings(user_id);
CREATE INDEX idx_ratings_score ON ratings(score);
CREATE INDEX idx_ratings_created_at ON ratings(created_at DESC);

-- Trending metrics: pre-calculated trend data
CREATE TABLE IF NOT EXISTS trending_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL UNIQUE REFERENCES skills(id) ON DELETE CASCADE,
  installs_7d INTEGER DEFAULT 0,
  installs_30d INTEGER DEFAULT 0,
  rating_avg NUMERIC(3, 2),
  rating_count INTEGER DEFAULT 0,
  trend_direction VARCHAR(50),
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trending_installs_7d ON trending_metrics(installs_7d DESC);
CREATE INDEX idx_trending_installs_30d ON trending_metrics(installs_30d DESC);
CREATE INDEX idx_trending_rating_avg ON trending_metrics(rating_avg DESC);
CREATE INDEX idx_trending_calculated_at ON trending_metrics(calculated_at DESC);

-- Installation log: analytics
CREATE TABLE IF NOT EXISTS installation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_id UUID REFERENCES versions(id) ON DELETE SET NULL,
  user_id VARCHAR(255),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT
);

CREATE INDEX idx_installation_log_skill_id ON installation_log(skill_id);
CREATE INDEX idx_installation_log_version_id ON installation_log(version_id);
CREATE INDEX idx_installation_log_timestamp ON installation_log(timestamp DESC);
CREATE INDEX idx_installation_log_status ON installation_log(status);

-- GIN index for full-text search on skills
CREATE INDEX idx_skills_search ON skills USING gin(
  to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(description, ''))
);

-- Version-specific search (skill_id + version_tag)
CREATE INDEX idx_versions_lookup ON versions(skill_id, version_tag DESC);
