# Marketplace Load Test — Runbook

**Wave D deliverable.** Harness: `src/load-tests/marketplace-load.js`.
Parametrized load generator that measures p50/p95/p99 latency per read endpoint
against a **provisioned** PostgreSQL. Code-only in this repo — **not run live**
here (no PostgreSQL).

## Acceptance criterion

**p99 < 200 ms** for each read endpoint (`list`, `search`, `trending`,
`ratings`). The harness exits `0` only if every measured endpoint meets this;
otherwise it exits `1` and lists the failing endpoints. This is the charter SLA
gate.

## Guard behavior (no DB = green-skip)

If `DATABASE_URL` is unset the harness prints a skip message and exits `0`
without attempting a connection. CI without a database stays green.

## Parameters (charter defaults, override via env)

| Env var | Default | Meaning |
|---|---|---|
| `LOAD_USERS` | `50000` | user-id space for installs/ratings |
| `LOAD_SKILLS` | `1000` | skills seeded into the marketplace |
| `LOAD_CONCURRENT_INSTALLS` | `100` | concurrency of the install-write workload |
| `LOAD_REQUESTS` | `1000` | read requests measured per endpoint |
| `LOAD_READ_CONCURRENCY` | `50` | concurrency of read traffic |
| `LOAD_INSTALL_WRITES` | `1000` | total install writes measured |
| `LOAD_P99_TARGET_MS` | `200` | p99 acceptance threshold |
| `LOAD_RATINGS_PER_SKILL` | `3` | seed ratings per skill |
| `LOAD_INSTALLS_PER_SKILL` | `20` | seed installs per skill |
| `LOAD_REPORT_OUT` | *(unset)* | if set, write the JSON report to this path |
| `LOAD_SKIP_TEARDOWN` | *(unset)* | `1` keeps seeded rows (skip cleanup) |

The 50k/1k/100 charter targets are the DEFAULT constants. Start smaller when
smoke-testing the harness itself, e.g. `LOAD_SKILLS=50 LOAD_REQUESTS=200`.

## Prerequisites (target env)

- PostgreSQL 15+, migrations `0001` + `0002` applied (`npm run migrate`).
- `DATABASE_URL` exported to the shell.
- `npm install` done.
- Run against a **dedicated load database**, not production — the harness seeds
  and (by default) tears down large volumes of rows.

## Run

```powershell
# full charter-scale run (writes report to a file)
$env:LOAD_REPORT_OUT = "load-report.json"
npm run load:marketplace

# quick smoke of the harness at small scale
$env:LOAD_SKILLS = "50"; $env:LOAD_REQUESTS = "200"
npm run load:marketplace
```

The harness: (1) seeds M skills + versions + installs + ratings; (2) refreshes
`trending_metrics`; (3) drives `LOAD_REQUESTS` reads per endpoint at
`LOAD_READ_CONCURRENCY`; (4) drives the concurrent install-write workload;
(5) prints the JSON report; (6) tears down seeded rows (unless
`LOAD_SKIP_TEARDOWN=1`).

## Interpreting the JSON report

```jsonc
{
  "tool": "marketplace-load",
  "runId": "load-...",
  "config": { "skills": 1000, "requestsPerEndpoint": 1000, ... },
  "endpoints": [
    { "endpoint": "list",     "count": 1000, "errors": 0,
      "min": 2, "p50": 8, "p95": 40, "p99": 120, "max": 210 },
    { "endpoint": "search",   "p99": 150, ... },
    { "endpoint": "trending", "p99": 30,  ... },   // O(1) cached-table read
    { "endpoint": "ratings",  "p99": 90,  ... }
  ],
  "installWrite": { "endpoint": "install-write", "p99": 60, ... },
  "acceptance": { "p99TargetMs": 200, "pass": true, "failing": [] }
}
```

- `p99` is the number to watch against the 200 ms SLA. `acceptance.pass`
  summarizes the gate; `acceptance.failing` names any endpoint over target.
- `errors` counts non-2xx/5xx or thrown requests per endpoint — investigate any
  non-zero value before trusting the latency numbers.
- `trending` should be the fastest read: it serves one pre-computed
  `trending_metrics` row-set (the daily-batch design), so it stays O(1) w.r.t.
  install volume. If `trending` p99 climbs with data size, the batch/caching
  path regressed.
- If `list` or `search` p99 approaches 200 ms as `LOAD_SKILLS` grows, check the
  `idx_skills_category_status` / full-text GIN indexes are present (migrations
  `0001`/`0002`).

## Rollback / cleanup

Teardown runs automatically by `runId` prefix. If a run was killed mid-flight or
`LOAD_SKIP_TEARDOWN=1` was set, remove leftovers manually:

```sql
DELETE FROM ratings          WHERE user_id LIKE 'load-%';
DELETE FROM installation_log WHERE user_id LIKE 'load-%';
DELETE FROM skills           WHERE owner   LIKE 'load-%@load.local';
```
