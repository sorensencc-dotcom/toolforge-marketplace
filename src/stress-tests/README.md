# Phase 9 Stress Tests

GATE-04 fairness pattern: concurrent write validation.

## GATE-04 Fairness Pattern

Tests database fairness under concurrent load.

**Scenario:**
- 10 concurrent writers
- 100 total writes (10 per writer)
- Mix of operations: 60% skill creation, 40% rating updates
- Random delays between operations (1-50ms)

**Success Criteria:**
- ✓ All writes complete with no lock timeouts
- ✓ Duration <2500ms (p99 latency bound)
- ✓ ≥80% write completion rate

**Run:**
```bash
npm run stress:gate04
```

**Expected Output:**
```
GATE-04 Fairness Pattern Stress Test
====================================
Concurrent writers: 10
Total writes: 100
Writes per writer: 10

Cleaning up old test data...
Starting concurrent write tasks...

Results:
  Skills created: 60
  Ratings added: 40
  Total writes: 100
  Failed attempts: 0
  Duration: 1245ms
  Rate: 80.32 writes/sec

✓ PASSED: All writes completed in 1245ms (threshold: 2500ms)
✓ PASSED: Write completion rate 100.0% (threshold: 80%)
```

---

## Why GATE-04?

PostgreSQL can serialize concurrent writes across multiple tables (skills, ratings, installation_log). This test verifies:
1. **No deadlocks** — Transactions don't block indefinitely
2. **Fair scheduling** — All writers make progress
3. **Performance SLA** — Latency stays <2500ms p99 under load
4. **Durability** — ON CONFLICT clauses prevent race conditions

---

## Integration with CI/CD

Post-migration, run this test before deployments:
```bash
npm run migrate && npm run stress:gate04
```

Failure indicates schema or connection pool misconfiguration.
