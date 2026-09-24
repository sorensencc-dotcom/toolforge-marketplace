# Phase 9 Marketplace Database

PostgreSQL 15+ schema and migration infrastructure for the Toolforge Marketplace.

## Schema Overview

### Tables

- **skills** — Core skill metadata (name, category, description, owner, manifest)
- **versions** — Skill version history (tag, release date, changelog, checksum)
- **ratings** — User reviews and scores (1-5 stars, text review, unique per user/skill)
- **trending_metrics** — Pre-calculated trend data (installs 7d/30d, rating avg, count)
- **installation_log** — Analytics (skill installs, version, user, timestamp, status)

### Indexes

Full-text search on skills (name + description), fast lookups on:
- `skills.category`, `skills.owner`, `skills.status`
- `versions.skill_id`, `versions.version_tag`
- `ratings.skill_id`, `ratings.user_id`, `ratings.score`
- `trending_metrics.installs_7d`, `installs_30d`, `rating_avg`
- `installation_log.skill_id`, `version_id`, `timestamp`, `status`

## Usage

### Setup

```bash
# Install dependencies
npm install

# Set DATABASE_URL env var
export DATABASE_URL="postgresql://user:pass@localhost/marketplace_dev"

# Run migrations
npm run migrate
```

### Reset Database (dev only)

```bash
npm run migrate:reset
```

### Querying

```javascript
import { query, queryOne } from './src/db/connect.js';
import * as schema from './src/db/schema.js';

// Get a skill
const skill = await schema.getSkill(db, skillId);

// List skills (paginated)
const skills = await schema.listSkills(db, {
  category: 'linting',
  limit: 50,
  offset: 0,
  sort: 'created_at'
});

// Search skills
const results = await schema.searchSkills(db, 'auth middleware', {
  limit: 50,
  offset: 0
});

// Get versions
const versions = await schema.getVersions(db, skillId);

// Insert rating
const rating = await schema.insertRating(db, {
  skill_id: skillId,
  user_id: 'user@example.com',
  score: 5,
  review_text: 'Great tool!'
});

// Get trending
const trending = await schema.getTrendingMetrics(db, {
  window: '30d',
  limit: 50
});
```

## Performance Targets

- **List 50 skills:** <100ms (p99)
- **Search 1000 skills:** <200ms (p99)
- **Get skill detail:** <50ms (p99)
- **Get versions:** <50ms (p99)
- **Get trending:** <100ms (p99)

## Schema Immutability (Phase 9)

Schema is **frozen** after 2026-07-31. All changes via migrations only (append-only approach).

If schema changes needed post-freeze:
- Create new migration file (`0002_*.sql`)
- Use `ALTER TABLE` / `ADD COLUMN` patterns only
- No breaking changes (drop column, rename table, etc.)
- Test with full data set before deploying

## Stress Test (GATE-04 Pattern)

10 concurrent writers, 100 writes total, no lock timeout errors:

```bash
npm run stress:gate04
```

Expected: 100/100 writes succeed in <2500ms.

## Migration History

Migrations tracked in `schema_migrations` table. Run `npm run migrate` idempotently; only pending migrations execute.
