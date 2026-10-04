<!--
title: "Production Promotion Prerequisites Tracker"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# Production Promotion Prerequisites Tracker

**Status**: 🔒 BLOCKED — current checkout has no verified production prerequisite  
**Estimated Time to Fulfillment**: Unverified estimate; no committed schedule artifact  
**Last Updated**: 2026-08-23

> Evidence note: this tracker is a gate, not an approval record. A prerequisite may be marked complete only with a dated command/test receipt, environment identity, owner, and artifact link. The 2026-08-01 staging report is historical evidence and has not been independently rerun in this checkout. Enumerated prerequisite tasks total 28.

---

## Overview

Production promotion of the OllamaProvider and Toolforge API to the production Kubernetes cluster is **blocked** pending fulfillment of 5 required prerequisites. This document tracks progress toward production readiness.

---

## Prerequisite 1: GPU/Compute Infrastructure

**Status**: ⏳ NOT STARTED  
**Owner**: Infrastructure Team  
**Priority**: CRITICAL  
**Estimated Effort**: 1 week

### Current State (Staging)

- **Compute**: CPU-only inference (4-core shared)
- **Latency**: ~8 seconds per generation
- **Throughput**: 1–2 requests/second
- **Bottleneck**: CPU saturation limits concurrency to 5

### Production Requirement

- **GPU Nodes**: ≥2 dedicated GPU nodes (NVIDIA A100, H100, or equivalent)
- **Target Latency**: <500ms per generation
- **Target Throughput**: ≥10 requests/second
- **Ollama GPU Support**: CUDA 12.x + cuDNN 9.x
- **Storage**: 100+ GB SSD per GPU node (model cache)

### Tasks

- [ ] **1.1**: Provision GPU nodes to production cluster (Kubernetes node pool)
  - [ ] Select GPU type (A100 or H100)
  - [ ] Configure NVIDIA drivers on nodes
  - [ ] Validate GPU detection via `nvidia-smi`
  
- [ ] **1.2**: Deploy NVIDIA GPU Operator to production cluster
  - [ ] Install GPU operator Helm chart
  - [ ] Verify NVIDIA device plugins available
  - [ ] Validate GPU allocation to pods
  
- [ ] **1.3**: Install CUDA & cuDNN on GPU nodes
  - [ ] CUDA 12.x runtime
  - [ ] cuDNN 9.x libraries
  - [ ] Verify via `nvcc --version`
  
- [ ] **1.4**: Update Ollama StatefulSet for GPU
  - [ ] Add `nvidia.com/gpu` resource requests/limits
  - [ ] Configure `CUDA_VISIBLE_DEVICES` env var
  - [ ] Set `OLLAMA_HOST` to listen on GPU
  
- [ ] **1.5**: Performance validation
  - [ ] Test latency with production model (target: <500ms)
  - [ ] Load test: 100 concurrent requests
  - [ ] Monitor GPU utilization & temperature
  - [ ] Verify model caching on SSD

### Acceptance Criteria

- [ ] GPU nodes healthy and GPU memory available
- [ ] Ollama pod detects and uses GPU
- [ ] Latency <500ms for 95th percentile
- [ ] Throughput ≥10 req/sec sustained
- [ ] No thermal throttling under load

### Blocking Reason

CPU-only inference does not meet production SLA (target <500ms, currently ~8 seconds).

---

## Prerequisite 2: Production Secrets Provisioning

**Status**: ⏳ NOT STARTED  
**Owner**: Security Team  
**Priority**: CRITICAL  
**Estimated Effort**: 1 week

### Current State (Staging)

- Kubernetes Secret store (plaintext at rest)
- Manual secret creation
- No rotation policy
- No audit logging for secret access

### Production Requirement

- **Secret Store**: HashiCorp Vault or AWS Secrets Manager
- **Encryption**: AES-256 at rest + TLS in transit
- **Rotation**: Automated 30-day cycle
- **Audit Logging**: All access logged with timestamps, user, action
- **Emergency Revocation**: <5 min revocation for compromised secrets
- **Least Privilege**: RBAC: only Toolforge API pod can access secrets

### Required Secrets

```yaml
# Production Secrets (to be provisioned)
secrets/toolforge/ollama-api-key       # If Ollama requires auth
secrets/toolforge/telemetry-api-key    # Telemetry service credentials
secrets/toolforge/database-url         # Production PostgreSQL
secrets/toolforge/research-worker-key  # Research worker authentication
secrets/toolforge/cowork-gateway-key   # Cowork gateway credentials
```

### Tasks

- [ ] **2.1**: Set up HashiCorp Vault or AWS Secrets Manager in production
  - [ ] Choose secret store (Vault or AWS Secrets Manager)
  - [ ] Deploy & initialize
  - [ ] Configure encryption key management
  - [ ] Set up high availability (HA) replication
  
- [ ] **2.2**: Provision production secrets
  - [ ] Generate or migrate secrets from staging
  - [ ] Store in production secret store
  - [ ] Document secret purposes & rotation intervals
  
- [ ] **2.3**: Integrate with Kubernetes via External Secrets Operator
  - [ ] Install External Secrets Operator Helm chart
  - [ ] Create SecretStore CRD (connects to Vault/Secrets Manager)
  - [ ] Create ExternalSecret resources for each secret
  - [ ] Verify automatic sync from vault → Kubernetes Secret
  
- [ ] **2.4**: Implement secret rotation
  - [ ] Configure rotation interval (30 days)
  - [ ] Set up rotation automation (CronJob or Vault native)
  - [ ] Verify Toolforge API handles rotated secrets without restart
  - [ ] Test rollback if rotation fails
  
- [ ] **2.5**: Audit logging & monitoring
  - [ ] Enable audit logs for all secret access
  - [ ] Ship logs to SIEM (Splunk, DataDog, etc.)
  - [ ] Set up alerts for unauthorized access attempts
  - [ ] Create runbook for secret compromise response

### Acceptance Criteria

- [ ] Secrets encrypted at rest and in transit
- [ ] Automatic rotation working (tested with dummy secret)
- [ ] All access logged to audit trail
- [ ] Emergency revocation time <5 minutes
- [ ] RBAC: only Toolforge pods can access

### Blocking Reason

Manual secret management not compliant with production governance & security standards.

---

## Prerequisite 3: Production `RESEARCH_WORKER_URL` Configuration

**Status**: ⏳ NOT STARTED  
**Owner**: Platform Team  
**Priority**: HIGH  
**Estimated Effort**: 3 days

### Current State (Staging)

- Research worker URL not configured
- Ollama provider isolated from TRM chain
- No end-to-end validation

### Production Requirement

- **Production Research Worker Endpoint**: URL for TRM validation service
- **TorqueQuery Endpoint**: Knowledge base semantic search
- **kb-sync Materialization Endpoint**: Persistence layer
- **Environment-Specific Overrides**: Separate URLs for prod, staging, dev

### Configuration

```env
# Production Environment
RESEARCH_WORKER_URL=https://research-worker.prod.toolforge.internal
TORQUEQUERY_ENDPOINT=http://torquequery-service.toolforge.svc.cluster.local:8000
KB_SYNC_URL=http://kb-sync-service.toolforge.svc.cluster.local:9000

# Staging Environment (for testing)
RESEARCH_WORKER_URL=https://research-worker.staging.toolforge.internal
TORQUEQUERY_ENDPOINT=http://torquequery-service.toolforge-staging.svc.cluster.local:8000
KB_SYNC_URL=http://kb-sync-service.toolforge-staging.svc.cluster.local:9000

# Local Development (for local integration testing)
RESEARCH_WORKER_URL=http://localhost:5000
TORQUEQUERY_ENDPOINT=http://localhost:8000
KB_SYNC_URL=http://localhost:9000
```

### Tasks

- [ ] **3.1**: Determine research worker infrastructure
  - [ ] Identify TRM validation service host/port
  - [ ] Get DNS name or IP address
  - [ ] Verify network reachability from API pods
  
- [ ] **3.2**: Configure research worker URL in ConfigMap
  - [ ] Add `RESEARCH_WORKER_URL` to `k8s-manifests-production.yaml`
  - [ ] Add `TORQUEQUERY_ENDPOINT` for semantic search
  - [ ] Add `KB_SYNC_URL` for materialization
  
- [ ] **3.3**: Environment-specific overrides
  - [ ] Create separate ConfigMaps for prod, staging, dev
  - [ ] Use Kustomize or Helm overlays for deployment
  
- [ ] **3.4**: Validate connectivity
  - [ ] Test DNS resolution of research worker URL from API pods
  - [ ] Test HTTP connectivity (via curl in pod)
  - [ ] Verify TRM service responds on expected port
  
- [ ] **3.5**: Update API code to use research worker
  - [ ] Read URL from environment in application
  - [ ] Implement research worker client
  - [ ] Add error handling for unreachable worker

### Acceptance Criteria

- [ ] Research worker URL configured in production ConfigMap
- [ ] API pods can resolve and connect to research worker
- [ ] TRM validation service accessible on expected endpoint
- [ ] Environment-specific overrides working (prod ≠ staging ≠ dev)

### Blocking Reason

Research worker URL required for end-to-end chain validation (Sigil → TRM → kb-sync).

---

## Prerequisite 4: End-to-End Chain Validation

**Status**: ⏳ NOT STARTED  
**Owner**: QA Team  
**Priority**: CRITICAL  
**Estimated Effort**: 1 week

### Current State (Staging)

- OllamaProvider isolated from TRM chain
- No live chain validation

### Production Requirement

- **Full Chain**: Sigil approval → TorqueQuery → Ollama → TRM → kb-sync
- **Data Integrity**: No data loss through chain
- **Determinism**: Same input produces same output
- **Performance**: End-to-end latency <30 seconds
- **Error Handling**: Graceful failure at any stage

### Chain Flow

```
1. Sigil Approval
   ├─ User approves research request via Sigil interface
   └─ Generates research packet with spec and scope

2. TorqueQuery (Knowledge Base Retrieval)
   ├─ Semantic search for relevant knowledge base entries
   └─ Returns top-k documents matching research spec

3. Ollama Research Generation
   ├─ Feed retrieved context + spec to Ollama
   ├─ Generate research synthesis
   └─ Apply adversarial auditor consensus gate

4. TRM Validation
   ├─ Verify generated research matches declared scope
   ├─ Check for scope violations or hallucinations
   └─ Apply deterministic Iron Gate test

5. kb-sync Materialization
   ├─ If consensus=true, materialize to knowledge base
   ├─ Store with timestamp, source, approval chain
   └─ Sync to all knowledge bases
```

### Tasks

- [ ] **4.1**: Test chain end-to-end in staging environment
  - [ ] Create test research request
  - [ ] Run full chain: Sigil → TorqueQuery → Ollama → TRM → kb-sync
  - [ ] Verify each stage completes without errors
  - [ ] Validate output data integrity
  
- [ ] **4.2**: Performance validation
  - [ ] Measure end-to-end latency (target: <30 sec)
  - [ ] P50, P95, P99 latencies
  - [ ] Identify bottlenecks
  
- [ ] **4.3**: Determinism testing
  - [ ] Run same research request 3 times
  - [ ] Verify output is deterministic (same input = same output)
  - [ ] Document any non-deterministic stages
  
- [ ] **4.4**: Error handling scenarios
  - [ ] TorqueQuery returns empty (no matching context)
  - [ ] Ollama times out or returns error
  - [ ] TRM validation rejects output (consensus=false)
  - [ ] kb-sync materialization fails
  - [ ] Verify graceful failure & error messages
  
- [ ] **4.5**: Load test chain
  - [ ] 10 concurrent research requests
  - [ ] Monitor Ollama GPU utilization
  - [ ] Monitor TRM validation latency
  - [ ] Verify kb-sync handles concurrent writes
  
- [ ] **4.6**: Production readiness sign-off
  - [ ] Document chain validation results
  - [ ] Get approval from QA and Platform leads
  - [ ] Create runbook for production troubleshooting

### Acceptance Criteria

- [ ] Full chain executes without errors
- [ ] End-to-end latency <30 seconds
- [ ] Output deterministic (same input = same output)
- [ ] Error handling graceful (no crashes)
- [ ] Load test passes (10 concurrent requests)
- [ ] QA sign-off obtained

### Blocking Reason

Chain not validated end-to-end in production environment. Cannot promote without verifying full data flow.

---

## Prerequisite 5: Rollback & Failure Recovery Validation

**Status**: ⏳ NOT STARTED  
**Owner**: Reliability Team  
**Priority**: CRITICAL  
**Estimated Effort**: 1 week

### Current State (Staging)

- Not tested under production failure scenarios

### Production Requirement

| Scenario | RTO (Recovery Time Objective) | RPO (Recovery Point Objective) | Automated? |
|---|---|---|---|
| Ollama pod crash | <2 min | <5 min | ✅ Yes |
| GPU node failure | <5 min | <10 min | ✅ Yes |
| API deployment rollback | <3 min | 0 | ✅ Yes |
| Secret rotation | 0 | 0 | ✅ Yes (no downtime) |
| Database connection loss | <10 sec | <1 min | ✅ Yes (fallback) |

### Tasks

- [ ] **5.1**: Test Ollama pod crash recovery
  - [ ] Kill Ollama pod: `kubectl delete pod ollama-0 -n toolforge`
  - [ ] Verify automatic restart via StatefulSet
  - [ ] Measure RTO (target: <2 min)
  - [ ] Verify model cache persisted (no re-download)
  
- [ ] **5.2**: Test GPU node failure
  - [ ] Drain GPU node: `kubectl drain --ignore-daemonsets <node>`
  - [ ] Verify Ollama pod migrates to healthy node
  - [ ] Measure RTO (target: <5 min)
  - [ ] Verify no data loss
  
- [ ] **5.3**: Test API deployment rollback
  - [ ] Deploy broken API version to production
  - [ ] Trigger rollback: `kubectl rollout undo deployment/toolforge-api -n toolforge`
  - [ ] Verify previous version restored
  - [ ] Measure RTO (target: <3 min)
  - [ ] Verify no customer-facing errors
  
- [ ] **5.4**: Test secret rotation without downtime
  - [ ] Rotate a secret in vault/Secrets Manager
  - [ ] Verify External Secrets Operator syncs new secret
  - [ ] Monitor API logs for secret access
  - [ ] Verify no request failures during rotation
  - [ ] Measure downtime (target: 0 sec)
  
- [ ] **5.5**: Test database connection loss
  - [ ] Kill database connection: `iptables -A OUTPUT -p tcp --dport 5432 -j DROP`
  - [ ] Verify API falls back to fallback DB
  - [ ] Measure failover time (target: <10 sec)
  - [ ] Verify fallback DB still responding
  
- [ ] **5.6**: Chaos engineering (optional)
  - [ ] Use Chaoskube to randomly kill pods
  - [ ] Monitor system stability over 1 hour
  - [ ] Document any cascading failures
  
- [ ] **5.7**: Create runbooks
  - [ ] Document recovery procedures for each scenario
  - [ ] Assign on-call escalation procedures
  - [ ] Train team on runbooks

### Acceptance Criteria

- [ ] RTO met for all scenarios (≤5 min max)
- [ ] RPO met for all scenarios (≤10 min max)
- [ ] All recovery automated (no manual intervention required)
- [ ] Runbooks created and team trained
- [ ] Reliability sign-off obtained

### Blocking Reason

Failure recovery not validated. Cannot promote without ensuring production reliability SLA.

---

## Overall Status Summary

| # | Prerequisite | Status | Owner | ETA | Blocker |
|---|---|---|---|---|---|
| 1 | GPU Infrastructure | ⏳ TODO | Infra | Week 1 | CRITICAL |
| 2 | Secrets Provisioning | ⏳ TODO | Security | Week 1 | CRITICAL |
| 3 | Research Worker Config | ⏳ TODO | Platform | 3 days | HIGH |
| 4 | E2E Chain Validation | ⏳ TODO | QA | Week 1 | CRITICAL |
| 5 | Rollback & Recovery | ⏳ TODO | Reliability | Week 1 | CRITICAL |

**Total Progress**: 0/28 tasks independently verified (0%)  
**Critical Path**: Uncommitted estimate; schedule requires owner-approved evidence

---

## Promotion Gate Checklist

Production promotion gate will open only when **all 5 prerequisites + all tasks are complete**:

- [ ] Prerequisite 1: GPU infrastructure operational & performance validated
- [ ] Prerequisite 2: Production secrets provisioning complete & audit logging live
- [ ] Prerequisite 3: Research worker URL configured & connectivity verified
- [ ] Prerequisite 4: End-to-end chain validated & QA sign-off obtained
- [ ] Prerequisite 5: Failure recovery tested & runbooks created
- [ ] All tests passing (261/261)
- [ ] Security audit passed (external pen-test)
- [ ] Performance SLA met (latency <500ms, throughput ≥10 req/sec)
- [ ] Business approval obtained (Product & Engineering leads)

**Gate Status**: 🔒 **BLOCKED** (0/5 prerequisites independently verified)

## Current Checkout Evidence (2026-08-23)

| Area | Observed evidence | Gate impact |
|---|---|---|
| Compute | k8s-manifests.yaml requests CPU only; no nvidia.com/gpu resources or GPU operator configuration | Prerequisite 1 remains blocked |
| Secrets | Manifest contains placeholder values and directs production use to an external backend | Prerequisite 2 remains blocked |
| Chain configuration | Manifest contains no RESEARCH_WORKER_URL, TORQUEQUERY_ENDPOINT, or KB_SYNC_URL entries | Prerequisite 3 remains blocked |
| E2E/recovery | No current live receipts were found during this review | Prerequisites 4 and 5 remain blocked |
| Tests | package.json exposes separate test commands; historical totals are not current receipts | Do not claim 261/261 without rerunning and storing output |

Historical report: [STAGING_VERIFICATION_REPORT.md](STAGING_VERIFICATION_REPORT.md). Treat it as an artifact from 2026-08-01, not current production approval.

---

## Contact & Escalation

| Role | Name | Contact | On-Call |
|---|---|---|---|
| Infrastructure Lead | TBD | TBD | 24/7 escalation: `#prod-incidents` |
| Security Lead | TBD | TBD | 24/7 escalation: `#security-incidents` |
| Platform Lead | TBD | TBD | 24/7 escalation: `#platform-incidents` |
| QA Lead | TBD | TBD | 24/7 escalation: `#qa-incidents` |
| Reliability Lead | TBD | TBD | 24/7 escalation: `#reliability-incidents` |

---

**Document Version**: 1.1  
**Last Updated**: 2026-08-23

> Evidence note: this tracker is a gate, not an approval record. A prerequisite may be marked complete only with a dated command/test receipt, environment identity, owner, and artifact link. The 2026-08-01 staging report is historical evidence and has not been independently rerun in this checkout. Enumerated prerequisite tasks total 28.  
**Next Review**: 2026-08-30
