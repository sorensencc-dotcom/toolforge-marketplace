#!/usr/bin/env node
import assert from 'node:assert/strict';
// Phase 9 Wave D — E2E runner harness.
//
// Runs the 5 charter end-to-end scenarios (discover -> install -> rate ->
// update -> trending recalc) against a REAL Express app (createApp) backed by a
// REAL PostgreSQL. Style matches src/api/server.test.js: boot the app on an
// ephemeral port and drive it with fetch.
//
// GUARD: E2E requires a provisioned PostgreSQL. If DATABASE_URL is unset the
// harness prints a skip message and exits 0 (green-skip), so CI without a DB is
// not red. No DB connection is attempted in that case — pg/server are imported
// dynamically only AFTER the guard passes.
//
//   npm run e2e            # runs all scenarios (skips cleanly if no DATABASE_URL)
//
// NOT RUN LIVE in this environment (no PostgreSQL). Execute in the target env.

const SKIP_MESSAGE =
  'E2E requires provisioned PG — set DATABASE_URL (e.g. postgresql://localhost:5432/marketplace_dev) to run. Skipping.';

/**
 * A short random run id so parallel/rerun invocations never collide and each run
 * cleans up exactly what it created. Used as a prefix on all seeded rows.
 */
export function makeRunId() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Minimal HTTP client bound to a base URL. Returns { status, body }.
 * @param {string} base
 */
export function makeClient(base) {
  async function request(method, path, { headers = {}, body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let parsed = null;
    const text = await res.text();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: res.status, body: parsed };
  }
  return {
    get: (p, opts) => request('GET', p, opts),
    post: (p, opts) => request('POST', p, opts),
    put: (p, opts) => request('PUT', p, opts),
    del: (p, opts) => request('DELETE', p, opts),
  };
}

/** Assertion helper backed by node:assert/strict. */
export function expect(label, condition, detail = '') {
  assert.ok(condition, `ASSERT FAILED: ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Build the E2E context: a real pg pool, a db adapter, and a running app server
 * on an ephemeral port. Caller must call ctx.close() in a finally block.
 * @returns {Promise<{db, base, client, pool, server, close}>}
 */
export async function createContext() {
  const pg = (await import('pg')).default;
  const { createApp } = await import('../api/server.js');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = { query: (text, params) => pool.query(text, params) };

  const app = createApp(db);
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const client = makeClient(base);

  async function close() {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  return { db, base, client, pool, server, close };
}

/**
 * Delete every row this run created. Keyed on the run-id prefix so it is
 * idempotent and never touches other data. FKs cascade from skills, but we also
 * clean owner/user_id-tagged rows explicitly for clarity.
 */
export async function teardown(db, runId) {
  // ratings + installs reference skills via ON DELETE CASCADE, but user_id /
  // owner are the run-tagged columns; delete by those, then the skills.
  await db.query(`DELETE FROM ratings WHERE user_id LIKE $1`, [`${runId}%`]);
  await db.query(`DELETE FROM installation_log WHERE user_id LIKE $1`, [`${runId}%`]);
  await db.query(`DELETE FROM skills WHERE owner LIKE $1`, [`${runId}%`]);
}

/**
 * Seed a published skill owned by this run. Returns the inserted skill row.
 */
export async function seedSkill(db, runId, { name, category = 'e2e-cat', description = 'e2e skill' }) {
  const res = await db.query(
    `INSERT INTO skills (name, category, description, owner, manifest_json, status)
     VALUES ($1, $2, $3, $4, $5, 'published')
     RETURNING *`,
    [name, category, description, `${runId}@e2e.local`, '{}']
  );
  return res.rows[0];
}

/**
 * Seed a version for a skill. checksum must be globally unique.
 */
export async function seedVersion(db, skillId, versionTag, { releaseDate } = {}) {
  const res = await db.query(
    `INSERT INTO versions (skill_id, version_tag, release_date, changelog, checksum)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      skillId,
      versionTag,
      releaseDate || new Date().toISOString(),
      `E2E ${versionTag}`,
      `e2e-${skillId}-${versionTag}-${Math.random().toString(36).slice(2)}`,
    ]
  );
  return res.rows[0];
}

/**
 * Seed N successful installs for a skill, optionally back-dated by `daysAgo`
 * (used to shape 7d/30d/prev windows for the trending scenario).
 */
export async function seedInstalls(db, skillId, versionId, runId, count, { daysAgo = 0, userOffset = 0 } = {}) {
  for (let i = 0; i < count; i++) {
    await db.query(
      `INSERT INTO installation_log (skill_id, version_id, user_id, status, timestamp)
       VALUES ($1, $2, $3, 'success', NOW() - ($4 || ' days')::interval)`,
      [skillId, versionId, `${runId}-u${userOffset + i}@e2e.local`, String(daysAgo)]
    );
  }
}

// --- Runner ---

const SCENARIOS = [
  './01-discover.e2e.js',
  './02-install.e2e.js',
  './03-rate.e2e.js',
  './04-update.e2e.js',
  './05-trending.e2e.js',
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`[e2e] ${SKIP_MESSAGE}`);
    process.exit(0);
  }

  console.log('[e2e] DATABASE_URL set — running 5 scenarios against live PostgreSQL.\n');

  const results = [];
  for (const path of SCENARIOS) {
    const mod = await import(path);
    const scenario = mod.default;
    const start = Date.now();
    try {
      await scenario.run({
        createContext,
        teardown,
        seedSkill,
        seedVersion,
        seedInstalls,
        makeRunId,
        expect,
      });
      const ms = Date.now() - start;
      results.push({ name: scenario.name, ok: true, ms });
      console.log(`  PASS  ${scenario.name}  (${ms}ms)`);
    } catch (err) {
      const ms = Date.now() - start;
      results.push({ name: scenario.name, ok: false, ms, error: err.message });
      console.error(`  FAIL  ${scenario.name}  (${ms}ms)\n        ${err.message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[e2e] ${results.length - failed.length}/${results.length} scenarios passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

// Only run when invoked directly (not when imported by a scenario for helpers).
const isMain = process.argv[1] && import.meta.filename === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error('[e2e] harness crashed:', err);
    process.exit(1);
  });
}
