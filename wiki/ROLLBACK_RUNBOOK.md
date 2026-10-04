<!--
title: "Production Rollback Runbook — Phase 7"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# Production Rollback Runbook — Phase 7

**Document:** Operational procedures for production config + feature flag rollback  
**Audience:** On-call ops engineers, incident response team  
**Scope:** Manual rollback execution when Phase 6 health check fails  
**Ownership:** Phase 7 (created during Phase 7 execution; validated before production deployment)  

---

## Prerequisites

Before attempting rollback:

- [ ] **Phase 5 snapshot exists** — Pre-deployment config + feature flag snapshots captured for the proposal+variant pair
- [ ] **Rollback decision made** — Phase 6 health check failed; Phase 6 canary cohort is unhealthy; rollback approved by ops lead
- [ ] **Access confirmed** — ops team has etcd client access, Unleash admin API token, database SSH access
- [ ] **Backup available** — Database binary log or point-in-time snapshot available (mitigation if Phase 6 database rollback fails)
- [ ] **Communication** — Incident channel created; stakeholders notified of rollback attempt

**If any prerequisites missing:** DO NOT proceed. Escalate to engineering team.

---

## Rollback Trigger Conditions

Rollback initiated automatically by Phase 6 health gate **OR** manually triggered by ops:

**Automatic Trigger:**
- Phase 6 metrics exceeding error threshold (error_rate >1%, latency_p99 >5s, cost_delta >20%)
- Rollback gate activated by Phase 6 monitoring
- Phase 7 RollbackExecutor invoked automatically

**Manual Trigger:**
```bash
# If automatic rollback fails or ops wants to manually trigger:
curl -X POST http://rollback-api.internal/rollback \
  -H "Content-Type: application/json" \
  -d '{
    "proposal_id": "proposal-1",
    "variant_id": "variant-a",
    "reason": "Manual trigger: error rate spike"
  }'
```

---

## Step 1: Verify Snapshots Exist

**Goal:** Confirm pre-deployment snapshots captured; if missing, abort rollback.

### Check Config Snapshot (etcd)

```bash
# Connect to etcd
ETCD_ENDPOINT="127.0.0.1:2379"

# Verify config snapshot exists
etcdctl --endpoints=$ETCD_ENDPOINT get \
  /cic/deployment/config/proposal-1/variant-a/snapshot \
  --print-value-only | jq .

# Expected output:
# {
#   "proposal_id": "proposal-1",
#   "variant_id": "variant-a",
#   "config_snapshot": { ... },
#   "metadata": { "captured_at": 1689000000000, ... }
# }
```

**If snapshot missing:**
```
❌ STOP. Snapshot not found in etcd.
   Reason: Phase 5 may not have captured snapshot, or etcd data lost.
   Action: Escalate to engineering. Rollback cannot proceed safely without snapshot.
```

### Check Feature Flag Snapshot (state store)

```bash
# Verify feature flag snapshot exists
curl -s http://127.0.0.1:4242/api/admin/audit-events?search=proposal-1 \
  -H "Authorization: Bearer <unleash-api-token>" | jq '.[] | select(.action == "snapshot_captured")'

# Expected output: At least one audit entry with action "snapshot_captured"
```

**If snapshot missing:**
```
❌ STOP. Flag snapshot not found.
   Reason: Phase 5 may not have captured flag state, or Unleash audit log incomplete.
   Action: Escalate to engineering. Rollback cannot proceed safely.
```

**If both snapshots exist:** ✅ Proceed to Step 2.

---

## Step 2: Initiate Rollback Sequence

**Goal:** Start Phase 6 + Phase 7 rollback components in correct order.

### Confirm Phase 6 Rollback Completion

```bash
# Check Phase 6 rollback status (state store, database, cache)
curl -s http://rollback-api.internal/status/phase6 \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}' | jq .

# Expected output:
# {
#   "proposal_id": "proposal-1",
#   "variant_id": "variant-a",
#   "phase6_status": "complete",
#   "state_store_rolled_back": true,
#   "database_rolled_back": true,
#   "cache_rolled_back": true,
#   "timestamp": 1689000300000
# }
```

**If Phase 6 status NOT complete:**
```
⚠️  WARNING: Phase 6 rollback not yet complete.
   Action: Wait 30s, re-check status. If still incomplete after 3 attempts, escalate.
```

### Trigger Phase 7 Rollback (Automatic)

```bash
# Phase 7 rollback is triggered automatically by Phase 6 health gate.
# Monitor logs for Phase 7 completion:

# Check Phase 7 config rollback completion
curl -s http://rollback-api.internal/status/phase7/config \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}' | jq .

# Expected output:
# {
#   "proposal_id": "proposal-1",
#   "variant_id": "variant-a",
#   "config_rollback_status": "complete",
#   "etcd_revision": 44,
#   "restored_config_count": 5,
#   "timestamp": 1689000310000
# }
```

### Trigger Phase 7 Feature Flag Rollback (Automatic)

```bash
# Check Phase 7 feature flag rollback completion
curl -s http://rollback-api.internal/status/phase7/flags \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}' | jq .

# Expected output:
# {
#   "proposal_id": "proposal-1",
#   "variant_id": "variant-a",
#   "flags_rollback_status": "complete",
#   "restored_flag_count": 3,
#   "expected_flag_count": 3,
#   "timestamp": 1689000320000
# }
```

**If Phase 7 rollback fails:** Jump to **Troubleshooting (Section 4)**.

**If both Phase 6 + Phase 7 complete:** ✅ Proceed to Step 3.

---

## Step 3: Health Check Validation

**Goal:** Run post-rollback health check gate; verify all layers consistent.

### Automated Health Check

Phase 7 health gate runs automatically. Monitor output:

```bash
# Monitor health check status
curl -s http://rollback-api.internal/health/rollback \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}' | jq .

# Expected output:
# {
#   "passed": true,
#   "checks": {
#     "state_store_consistent": { "passed": true },
#     "database_consistent": { "passed": true },
#     "config_store_consistent": { "passed": true },
#     "feature_flags_consistent": { "passed": true },
#     "rollback_lineage_complete": { "passed": true },
#     "latency_ok": { "passed": true }
#   },
#   "latency_ms": 3200,
#   "timestamp": 1689000350000
# }
```

**If health check PASSED:** ✅ Rollback succeeded. Jump to **Step 4 (Confirmation)**.

**If health check FAILED:** ⚠️ Rollback incomplete. Jump to **Troubleshooting (Section 4)**.

---

## Step 4: Confirmation & Promotion Restart

**Goal:** Confirm rollback complete; allow promotion restart.

### Verify Metrics Recovered

```bash
# Check that Phase 6 metrics returned to baseline
curl -s http://metrics.internal/query?query=cic_error_rate | jq .

# Expected: error_rate <0.5%, latency_p99 <2s, cost_delta <10%
```

### Notify Stakeholders

```
✅ Rollback complete.
   Proposal: proposal-1, Variant: variant-a
   Config: Restored to pre-deployment state (etcd revision 42)
   Flags: Restored to pre-deployment state (3 flags)
   Metrics: error_rate 0.3%, latency_p99 1.8s, cost_delta 5%
   Next: On-call can restart promotion or defer to next sprint.
```

### Allow Promotion Restart (Optional)

```bash
# If metrics recovered, promotion can restart with new variant
# OR ops can hold for engineering review (recommended after incident)

# To restart promotion:
curl -X POST http://rollback-api.internal/promotion/restart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "next_variant": "variant-b"}'
```

---

## Troubleshooting

### Scenario 1: Config Snapshot Missing or Corrupt

**Symptom:** `Config store consistency check FAILED: snapshot_missing or checksum_mismatch`

**Diagnosis:**

```bash
# Verify snapshot exists
etcdctl --endpoints=$ETCD_ENDPOINT get /cic/deployment/config/proposal-1/variant-a/snapshot

# If missing: Phase 5 did not capture. If corrupt: etcd data loss or rollback target write failed.
```

**Recovery:**

**Option A: Manual etcd restore from backup (if available)**

```bash
# Restore etcd from snapshot backup taken before Phase 5
etcdctl snapshot restore \
  /backups/etcd-before-phase5-2026-07-19T00:00:00Z.snap \
  --data-dir=/var/lib/etcd-restored

# Restart etcd with restored data
systemctl stop etcd
rm -rf /var/lib/etcd
cp -r /var/lib/etcd-restored /var/lib/etcd
systemctl start etcd

# Verify config restored
etcdctl --endpoints=$ETCD_ENDPOINT get /cic/deployment/config/proposal-1/variant-a/snapshot
```

**Option B: Manual config rollback via etcd CLI (if snapshot available elsewhere)**

```bash
# If snapshot available in code repo or backup system:
SNAPSHOT='{"proposal_id":"proposal-1","variant_id":"variant-a","config_snapshot":{"key":"value"}}'

# Restore to etcd
etcdctl --endpoints=$ETCD_ENDPOINT put \
  /cic/deployment/config/proposal-1/variant-a/rollback \
  "$SNAPSHOT"
```

**If recovery fails:** Escalate to database recovery team. Manual database point-in-time recovery may be needed.

---

### Scenario 2: Feature Flag Restore Timeout or Partial Restore

**Symptom:** `Feature flag consistency check FAILED: restored_count < expected_count or timeout`

**Diagnosis:**

```bash
# Check which flags failed to restore
curl -s http://rollback-api.internal/logs/phase7/flags \
  -H "Authorization: Bearer <api-token>" | grep -i "error\|failed"

# Expected: Specific flag names that failed (e.g., "enable_ml_v2_enrichment__proposal-1__variant-a")
```

**Recovery:**

**Option A: Retry flag restore via Phase 7 API**

```bash
# Retry flag restoration
curl -X POST http://rollback-api.internal/rollback/phase7/flags/retry \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}'

# Monitor progress; if succeeds, health check gate should now pass.
```

**Option B: Manual flag restore via Unleash UI**

```bash
# If API retry fails, restore flags manually:
# 1. Navigate to http://127.0.0.1:4242/admin/features
# 2. Find flags for proposal-1:variant-a
# 3. For each flag, toggle enabled state back to pre-deployment value
#    (snapshot captured state)
# 4. Save changes

# Verify via API:
curl -s http://127.0.0.1:4242/api/admin/features/enable_ml_v2_enrichment__proposal-1__variant-a \
  -H "Authorization: Bearer <unleash-api-token>" | jq '.enabled'
```

**If manual restore fails:** Unleash API may be unavailable. Escalate to infrastructure team.

---

### Scenario 3: Health Check Latency Timeout (>10s)

**Symptom:** `Health check FAILED: latency_ok = false (elapsed 15000ms)`

**Diagnosis:**

```bash
# Check which check took longest
curl -s http://rollback-api.internal/health/rollback/detailed \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}' | jq '.checks | sort_by(.latency_ms)'

# Look for checks with latency >5s (likely database or Unleash API)
```

**Recovery:**

```bash
# If database check slow:
# - Check database load (top, iostat)
# - Verify network connectivity to database
# - Consider scaling database horizontally if heavily loaded

# If Unleash API slow:
# - Check Unleash server load
# - Verify network connectivity to Unleash
# - Consider increasing Unleash replica count

# Retry health check (often temporary)
curl -X POST http://rollback-api.internal/health/rollback/check-again \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}'
```

**If latency persists:** Escalate to infrastructure. Rollback may be blocked until service responsiveness recovers.

---

### Scenario 4: Database Consistency Mismatch

**Symptom:** `Database consistency check FAILED: row_count_mismatch or row_hash_mismatch`

**Diagnosis:**

```bash
# Check current row count vs snapshot
PROPOSAL_ID="proposal-1"
VARIANT_ID="variant-a"

# Current count
mysql> SELECT COUNT(*) FROM ingestion_results WHERE proposal_id = '$PROPOSAL_ID' AND variant_id = '$VARIANT_ID';

# Expected count (from Phase 6 snapshot)
# Should match snapshot.expectedRowCount from Phase 6 rollback log
```

**Recovery:**

```bash
# If Phase 6 database rollback incomplete, retry Phase 6 database rollback
curl -X POST http://rollback-api.internal/rollback/phase6/database/retry \
  -H "Authorization: Bearer <api-token>" \
  -d '{"proposal_id": "proposal-1", "variant_id": "variant-a"}'

# If retry fails, manual database recovery:
# 1. Determine last good snapshot (before Phase 6 deployment)
# 2. Restore from backup:
mysql> RESTORE FROM /backups/mysql-before-phase6-2026-07-19T00:00:00Z.sql;

# 3. Verify row count recovered
mysql> SELECT COUNT(*) FROM ingestion_results WHERE proposal_id = 'proposal-1' AND variant_id = 'variant-a';
```

**If manual recovery fails:** Escalate to database team. Point-in-time recovery specialist needed.

---

## Rollback Verification Checklist

After rollback complete AND health check passed, ops verifies:

- [ ] Config state restored (etcd snapshot matches rollback target)
- [ ] Feature flags restored (all flags match snapshot state in Unleash)
- [ ] Database restored (row count + checksums match snapshot)
- [ ] Metrics recovered (error_rate <0.5%, latency_p99 <2s)
- [ ] Audit trail complete (rollback actions logged in etcd + Unleash)
- [ ] No customer-facing errors reported (logs + error tracking system clean)
- [ ] Promotion can safely restart (health gate passes consistently)

**If any check fails:** DO NOT proceed with promotion restart. Escalate to engineering.

---

## Escalation Paths

**When to escalate:**

| Issue | Escalate to | Contact |
|-------|-------------|---------|
| Config snapshot missing | Engineering (Phase 5 team) | @phase5-oncall |
| Config snapshot corrupt | Database recovery specialist | @dba-oncall |
| Feature flag restore timeout | Unleash infrastructure | @unleash-oncall |
| Database row count mismatch | Database recovery specialist | @dba-oncall |
| Health check latency timeout | Infrastructure | @infra-oncall |
| Multiple cascading failures | Incident commander | @incident-cmd |

**Incident Commander Decision Points:**

- After 3 failed rollback attempts → STOP. Escalate decision to VP Eng.
- If rollback incomplete >30 min after attempt → manual traffic reroute (may need load balancer config change)
- If proposal unhealthy + rollback fails → consider data loss investigation (customer impact audit)

---

## Post-Incident

After rollback complete, ops schedules engineering review:

1. **Root cause:** Why did Phase 6 health check fail? Config drift? Code bug? Load issue?
2. **Prevention:** Should Phase 5 have caught this? Could snapshot capture be earlier?
3. **Runbook update:** Did ops follow this runbook successfully? Any gaps?
4. **Monitoring:** Did alerts fire quickly enough? Metric thresholds appropriate?

Document findings in incident ticket; close incident when engineering confirms root cause fix planned.

---

## Appendix A: Commands Reference

### etcd Commands

```bash
# Get config snapshot
etcdctl --endpoints=127.0.0.1:2379 get /cic/deployment/config/proposal-1/variant-a/snapshot

# Put config (if manual restore)
etcdctl --endpoints=127.0.0.1:2379 put /cic/deployment/config/proposal-1/variant-a/rollback '{"restored_config":...}'

# Check etcd health
etcdctl --endpoints=127.0.0.1:2379 endpoint health
```

### Unleash Commands

```bash
# List flags
curl -s http://127.0.0.1:4242/api/admin/features \
  -H "Authorization: Bearer <api-token>" | jq '.features[] | select(.name | contains("proposal-1"))'

# Update flag (manual restore)
curl -X PUT http://127.0.0.1:4242/api/admin/features/enable_ml_v2_enrichment__proposal-1__variant-a \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <api-token>" \
  -d '{"enabled": false, "strategies": [], "variants": []}'

# Check health
curl -s http://127.0.0.1:4242/health | jq .
```

### Database Commands

```bash
# Row count for proposal+variant
mysql -u root -p -e "SELECT COUNT(*) FROM ingestion_results WHERE proposal_id = 'proposal-1' AND variant_id = 'variant-a';"

# Restore from backup
mysql -u root -p < /backups/mysql-2026-07-19T00:00:00Z.sql
```

---

## Appendix B: Alert Rules

Configure alerting to notify ops:

```yaml
# Prometheus alert rule
alert: RollbackHealthCheckFailed
  expr: cic_rollback_health_check_passed == 0
  for: 1m
  annotations:
    summary: "Rollback health check failed for {{ $labels.proposal_id }}:{{ $labels.variant_id }}"
    action: "Consult runbook Section 4 (Troubleshooting)"

alert: RollbackLatencyHigh
  expr: cic_rollback_health_check_latency_ms > 10000
  for: 1m
  annotations:
    summary: "Rollback health check latency >10s"
    action: "Check infrastructure; may need to retry or escalate"
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-11  
**Owner:** Phase 7 Rollback Team  
**Approval:** Tier 1 (pending)
