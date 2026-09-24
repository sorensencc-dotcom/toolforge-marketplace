#!/usr/bin/env node
// Phase 9 Wave D — Marketplace load-test harness.
//
// Parametrized load generator for the discovery API. Seeds a marketplace of
// M skills, drives concurrent read traffic across the four hot read endpoints
// (list, search, trending, ratings) plus a concurrent install-write workload,
// and reports p50/p95/p99 latency per endpoint as a JSON report.
//
// Charter targets are the DEFAULT constants (overridable via env):
//   50,000 users, 1,000 skills, 100 concurrent installs.
// Acceptance criterion: p99 < 200ms per read endpoint (see docs/wave-d/LOAD-TEST.md).
//
// GUARD: requires a provisioned PostgreSQL. If DATABASE_URL is unset the harness
// prints a skip message and exits 0 (green-skip) WITHOUT attempting a
// connection — pg/server are imported dynamically only after the guard passes.
//
//   npm run load:marketplace       # skips cleanly if no DATABASE_URL
//
// NOT RUN LIVE in this environment (no PostgreSQL). Execute in the target env.
//
// Style follows src/stress-tests/gate04-fairness.js (own pool, ECONNREFUSED
// handling, threshold check, process.exit).

import { fileURLToPath } from 'url';

// --- Parameters (charter defaults; override via env) ---
const CONFIG = {
  users: intEnv('LOAD_USERS', 50_000), // user-id space for installs/ratings
  skills: intEnv('LOAD_SKILLS', 1_000), // skills to seed
  concurrentInstalls: intEnv('LOAD_CONCURRENT_INSTALLS', 100),
  requestsPerEndpoint: intEnv('LOAD_REQUESTS', 1_000), // read requests measured per endpoint
  readConcurrency: intEnv('LOAD_READ_CONCURRENCY', 50),
  installWrites: intEnv('LOAD_INSTALL_WRITES', 1_000), // total install writes to measure
  p99TargetMs: intEnv('LOAD_P99_TARGET_MS', 200),
  seedRatingsPerSkill: intEnv('LOAD_RATINGS_PER_SKILL', 3),
  seedInstallsPerSkill: intEnv('LOAD_INSTALLS_PER_SKILL', 20),
  reportOut: process.env.LOAD_REPORT_OUT || null,
  skipTeardown: process.env.LOAD_SKIP_TEARDOWN === '1',
};

const SKIP_MESSAGE =
  'Load test requires provisioned PG — set DATABASE_URL to run. Skipping.';

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// --- Latency stats ---

/** Percentile (nearest-rank) over an unsorted number array (ms). */
function percentile(samples, p) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

function summarize(name, samples, errors) {
  return {
    endpoint: name,
    count: samples.length,
    errors,
    min: samples.length ? Math.min(...samples) : null,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples.length ? Math.max(...samples) : null,
  };
}

/**
 * Run `total` async tasks with a bounded worker pool of `concurrency`.
 * taskFn(i) -> Promise. Collects { ms } latency per task and error count.
 * @returns {Promise<{latencies:number[], errors:number}>}
 */
async function runPool(total, concurrency, taskFn) {
  const latencies = [];
  let errors = 0;
  let next = 0;

  async function worker() {
    // eslint-disable-next-line no-constant-condition -- pool worker loop, exits via return below
    while (true) {
      const i = next++;
      if (i >= total) return;
      const start = Date.now();
      try {
        await taskFn(i);
        latencies.push(Date.now() - start);
      } catch (err) {
        if (err && err.code === 'ECONNREFUSED') throw err;
        errors++;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);
  return { latencies, errors };
}

// --- Seeding ---

function uuidLike() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function seed(db, runId) {
  const categories = ['automation', 'linting', 'testing', 'formatting', 'security', 'docs'];
  const skillIds = [];
  const versionIds = [];

  // Skills + one version each (batched inserts to keep seeding tractable).
  const BATCH = 100;
  for (let start = 0; start < CONFIG.skills; start += BATCH) {
    const end = Math.min(start + BATCH, CONFIG.skills);
    const values = [];
    const params = [];
    for (let i = start; i < end; i++) {
      const p = params.length;
      values.push(`($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, 'published')`);
      params.push(
        `${runId}-skill-${i}`,
        categories[i % categories.length],
        `Load skill ${i} search-term-${i % 50}`,
        `${runId}@load.local`,
        '{}'
      );
    }
    const res = await db.query(
      `INSERT INTO skills (name, category, description, owner, manifest_json, status)
       VALUES ${values.join(',')} RETURNING id`,
      params
    );
    for (const row of res.rows) skillIds.push(row.id);
  }

  // One published version per skill.
  for (const skillId of skillIds) {
    const res = await db.query(
      `INSERT INTO versions (skill_id, version_tag, release_date, changelog, checksum)
       VALUES ($1, '1.0.0', NOW(), 'seed', $2) RETURNING id`,
      [skillId, `${runId}-${uuidLike()}`]
    );
    versionIds.push(res.rows[0].id);
  }

  // Installs + ratings so trending/ratings endpoints have realistic data.
  for (let s = 0; s < skillIds.length; s++) {
    const skillId = skillIds[s];
    const versionId = versionIds[s];
    for (let k = 0; k < CONFIG.seedInstallsPerSkill; k++) {
      const uid = `${runId}-u${Math.floor(Math.random() * CONFIG.users)}@load.local`;
      const daysAgo = Math.floor(Math.random() * 14);
      await db.query(
        `INSERT INTO installation_log (skill_id, version_id, user_id, status, timestamp)
         VALUES ($1, $2, $3, 'success', NOW() - ($4 || ' days')::interval)`,
        [skillId, versionId, uid, String(daysAgo)]
      );
    }
    for (let r = 0; r < CONFIG.seedRatingsPerSkill; r++) {
      const uid = `${runId}-r${s}-${r}@load.local`;
      await db.query(
        `INSERT INTO ratings (skill_id, user_id, score, review_text)
         VALUES ($1, $2, $3, 'load review')
         ON CONFLICT (skill_id, user_id) DO NOTHING`,
        [skillId, uid, (r % 5) + 1]
      );
    }
  }

  return { skillIds, versionIds, categories };
}

async function teardown(db, runId) {
  await db.query(`DELETE FROM ratings WHERE user_id LIKE $1`, [`${runId}%`]);
  await db.query(`DELETE FROM installation_log WHERE user_id LIKE $1`, [`${runId}%`]);
  await db.query(`DELETE FROM skills WHERE owner LIKE $1`, [`${runId}@load.local`]);
}

// --- Main ---

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`[load] ${SKIP_MESSAGE}`);
    process.exit(0);
  }

  const pg = (await import('pg')).default;
  const { createApp } = await import('../api/server.js');
  const { runTrendingRefresh } = await import('../services/trending-batch.js');

  const runId = `load-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: Math.max(CONFIG.readConcurrency, CONFIG.concurrentInstalls) + 4,
  });
  const db = { query: (text, params) => pool.query(text, params) };

  const app = createApp(db);
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const report = {
    tool: 'marketplace-load',
    runId,
    startedAt: new Date().toISOString(),
    config: CONFIG,
    endpoints: [],
    installWrite: null,
    acceptance: null,
  };

  try {
    console.log(`[load] seeding ${CONFIG.skills} skills (users space ${CONFIG.users})...`);
    const seedStart = Date.now();
    const { skillIds } = await seed(db, runId);
    console.log(`[load] seeded in ${Date.now() - seedStart}ms; refreshing trending...`);
    await runTrendingRefresh(db);

    // Read endpoints under test. Each mixes params to avoid a single hot row.
    const endpoints = [
      { name: 'list', fn: (i) => `/api/v1/skills?limit=50&offset=${(i % 20) * 50}` },
      { name: 'search', fn: (i) => `/api/v1/skills/search?q=search-term-${i % 50}` },
      { name: 'trending', fn: () => `/api/v1/skills/trending?window=7d&limit=50` },
      { name: 'ratings', fn: (i) => `/api/v1/skills/${skillIds[i % skillIds.length]}/ratings?limit=20` },
    ];

    for (const ep of endpoints) {
      console.log(`[load] ${ep.name}: ${CONFIG.requestsPerEndpoint} reqs @ concurrency ${CONFIG.readConcurrency}...`);
      const { latencies, errors } = await runPool(
        CONFIG.requestsPerEndpoint,
        CONFIG.readConcurrency,
        async (i) => {
          const res = await fetch(`${base}${ep.fn(i)}`);
          if (res.status >= 500) throw new Error(`status ${res.status}`);
          await res.text();
        }
      );
      report.endpoints.push(summarize(ep.name, latencies, errors));
    }

    // Concurrent install-write workload (K concurrent installs).
    console.log(`[load] install writes: ${CONFIG.installWrites} @ concurrency ${CONFIG.concurrentInstalls}...`);
    const iw = await runPool(CONFIG.installWrites, CONFIG.concurrentInstalls, async (i) => {
      const uid = `${runId}-iw${i}@load.local`;
      await db.query(
        `INSERT INTO installation_log (skill_id, user_id, status) VALUES ($1, $2, 'success')`,
        [skillIds[i % skillIds.length], uid]
      );
    });
    report.installWrite = summarize('install-write', iw.latencies, iw.errors);

    // Acceptance: every read endpoint p99 under target.
    const readFail = report.endpoints.filter((e) => e.p99 !== null && e.p99 >= CONFIG.p99TargetMs);
    report.acceptance = {
      p99TargetMs: CONFIG.p99TargetMs,
      pass: readFail.length === 0,
      failing: readFail.map((e) => ({ endpoint: e.endpoint, p99: e.p99 })),
    };
    report.finishedAt = new Date().toISOString();

    const json = JSON.stringify(report, null, 2);
    console.log('\n===== LOAD REPORT (JSON) =====');
    console.log(json);

    if (CONFIG.reportOut) {
      const fs = await import('fs');
      fs.writeFileSync(CONFIG.reportOut, json);
      console.log(`[load] report written to ${CONFIG.reportOut}`);
    }

    if (report.acceptance.pass) {
      console.log(`\n[load] PASS: all read endpoints p99 < ${CONFIG.p99TargetMs}ms`);
      process.exit(0);
    } else {
      console.error(`\n[load] FAIL: p99 target exceeded on ${readFail.map((e) => e.endpoint).join(', ')}`);
      process.exit(1);
    }
  } catch (err) {
    if (err && err.code === 'ECONNREFUSED') {
      console.error('[load] FAILED: database connection refused. Ensure PostgreSQL is reachable via DATABASE_URL.');
    } else {
      console.error('[load] FAILED:', err.message);
    }
    process.exit(1);
  } finally {
    if (!CONFIG.skipTeardown) {
      try {
        await teardown(db, runId);
      } catch (err) {
        console.error('[load] teardown warning:', err.message);
      }
    }
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error('[load] harness crashed:', err);
    process.exit(1);
  });
}
