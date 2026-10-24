# Phase 9 Marketplace Database

PostgreSQL 15+ schema and migration infrastructure for the Toolforge Marketplace.

## Schema Overview

### Tables

- **skills** — Core skill metadata (name, category, description, owner, manifest)
- **versions** — Skill version history (tag, release date, changelog, checksum, and the pinned source: `source_repo`, `source_ref`, `source_sha` from migration 0003, and `source_path` from migration 0004)
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

## Publishing a version

`npm run version:publish` records a version of an existing skill, pinned to a git commit, so `toolforge install` can fetch it. It is an offline operator tool: it writes straight to the database, so running it with `--apply` is the act of publishing. Nothing in the API can do this.

```bash
# dry run (default): resolves the ref, checks the source can be installed, prints the row
npm run version:publish -- --skill alpha --tag 1.0.0 --repo owner/name --ref v1.0.0 --path plugins/alpha

# write it (needs DATABASE_URL, which has no default on purpose)
DATABASE_URL=postgres://... npm run version:publish -- --skill alpha --tag 1.0.0 --repo owner/name --ref v1.0.0 --path plugins/alpha --apply
```

- `--ref` is a tag, branch, or full commit SHA. It is resolved to a full SHA; annotated tags are peeled to their commit. A branch is accepted with a warning, because it moves: the SHA recorded is its tip at that moment.
- `--path` is the subdirectory that holds the plugin; leave it off when the plugin is the whole repository.
- Before anything is written, the exact install the CLI would run (fetch, `HEAD` check, subdirectory, symlink check) runs into a temp directory, so only an installable source is recorded.
- Versions are immutable. Re-running with the same source is a no-op; a different source under an existing tag is refused. Publish a new tag instead.
- `versions.checksum` is `git:<sha>` or `git:<sha>:<path>`. The path keeps it unique when several plugins share one commit.
- The skill must already exist. The script creates versions, not skills.
- `TOOLFORGE_GIT_BASE_URL` overrides the git host, as it does for `install`.

### Backfilling the catalog

`npm run version:backfill` publishes every entry in `scripts/backfill-versions.json` through the same checks, so each catalog plugin gets an installable version. It is a dry run unless you pass `--apply`, and it needs `DATABASE_URL` to check or write the registry.

- Each entry names the `skill`, version `tag`, `repo`, `ref`, optional `path`, and the `sha` the ref must resolve to. A tag that has moved off its commit is refused.
- The three local plugins are pinned to a commit of this repository by SHA, because the repository has no tags yet. To use a tag, create it, then set `ref` to the tag name; `sha` stays the same.
- `toolforge-core` mirrors the pin in `.claude-plugin/marketplace.json`. A test fails if the list and the catalog disagree.
- Skills must already exist in the registry: nothing in this repository creates them. An entry whose skill is missing fails with a plain message; the others still run, and a re-run finishes the job.
- To publish a new version of a plugin, add an entry with a new `tag`. Do not edit an existing one: published versions are immutable.

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
