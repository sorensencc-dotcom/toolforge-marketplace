<!--
title: "OllamaProvider and staging deployment — evidence-gated index"
status: active
owner: chris
last-reviewed: 2026-09-27
brand: product-toolforge
-->

# OllamaProvider and staging deployment — evidence-gated index

**Status**: Current readiness unverified; production promotion blocked
**Date**: 2026-08-23
**Version**: 1.2

> This is a navigation and evidence-gating document, not a deployment receipt or approval. Historical reports remain historical. Do not infer current staging or production readiness without dated, independently reproducible evidence.

## Start here

### For current context

Read `STAGING_NEXT_STEPS.md` for the reviewed status summary, open blockers, and evidence requests.

### For historical verification claims

Read `STAGING_VERIFICATION_REPORT.md`. Its 2026-08-01 results are historical claims and require current receipts before reuse.

### For the promotion gate

Read `PRODUCTION_PREREQUISITES.md`. It defines 5 prerequisite areas containing 28 prerequisite tasks. Current checkout evidence records 0/28 tasks independently verified.

## Evidence policy

- Current status requires a dated command or test receipt, environment identity, owner, and artifact link.
- Historical reports may describe past results but do not establish present readiness.
- “Complete,” “deployed,” “operational,” “passing,” and “ready” are not current claims unless backed by current evidence.
- Timeline and effort estimates are unverified; no committed schedule artifact is present.
- Production promotion remains blocked until all 28 tasks and the promotion-gate evidence are independently verified.

## Documentation map

### Setup and integration

| Document | Purpose |
|---|---|
| `QUICKSTART.md` | Historical/local setup instructions; validate before use |
| `OLLAMA_PROVIDER_SETUP.md` | Provider integration reference |
| `OLLAMA_DEPLOYMENT_GUIDE.md` | Docker Compose and Kubernetes deployment reference |

### Implementation and verification

| Document | Purpose |
|---|---|
| `IMPLEMENTATION_SUMMARY.md` | Implementation description; not a current deployment receipt |
| `CHECKLIST.md` | Verification checklist |

### Staging and production gate

| Document | Purpose |
|---|---|
| `STAGING_VERIFICATION_REPORT.md` | Historical staging report dated 2026-08-01 |
| `STAGING_NEXT_STEPS.md` | Current review navigation and evidence requests |
| `PRODUCTION_PREREQUISITES.md` | Five prerequisite areas and 28-task promotion gate |

## Current checkout evidence

Observed during the 2026-08-23 review:

- Kubernetes configuration is CPU-only; no current GPU readiness evidence was found.
- Configuration contains placeholder secrets and no verified production secret-store receipt.
- No `RESEARCH_WORKER_URL`, `TORQUEQUERY_ENDPOINT`, or `KB_SYNC_URL` chain configuration was found in the reviewed manifest.
- No current live end-to-end or failure-recovery receipts were found.
- Historical test totals must not be presented as current test results without a fresh receipt.

These observations keep all 5 prerequisite areas blocked and leave current readiness unverified.

## Historical claims

The following are retained only as labeled historical claims from `STAGING_VERIFICATION_REPORT.md` dated 2026-08-01:

- Historical report claimed a Kubernetes staging deployment with Ollama, API, services, storage, and model loading.
- Historical report claimed 7/7 smoke tests passed.
- Historical report claimed 261/261 tests passed.
- Historical report claimed security controls, model reachability, privacy, prompt limits, adversarial audit, and concurrency behavior.

No item above is a current receipt, production approval, or present-tense readiness statement.

## Promotion gate

Production promotion is blocked pending independent evidence for all 28 prerequisite tasks across these 5 areas:

1. GPU/compute infrastructure — tasks 1.1–1.5
2. Production secrets provisioning — tasks 2.1–2.5
3. Production research-worker configuration — tasks 3.1–3.5
4. End-to-end chain validation — tasks 4.1–4.6
5. Rollback and failure recovery validation — tasks 5.1–5.7

**Total**: 28 tasks
**Current independently verified**: 0/28
**Timeline**: Unverified; no committed schedule artifact

Consult `PRODUCTION_PREREQUISITES.md` for task acceptance criteria and required evidence. A historical report, unchecked checklist, local commit, or document assertion does not satisfy the gate.

## Navigation by role

### Software developer

Start with `QUICKSTART.md` and `OLLAMA_PROVIDER_SETUP.md`; treat setup and implementation statements as references until validated in the current checkout.

### DevOps and SRE

Start with `STAGING_NEXT_STEPS.md`, then use `PRODUCTION_PREREQUISITES.md` to collect infrastructure, secrets, configuration, and recovery evidence.

### Tech lead

Review `IMPLEMENTATION_SUMMARY.md`, `CHECKLIST.md`, and the 28-task gate. Require current receipts before recording completion.

### Product manager

Use `STAGING_NEXT_STEPS.md` and `PRODUCTION_PREREQUISITES.md` for blockers. Timeline is unverified; do not communicate a delivery date as committed.

## Validation checklist

- [ ] Current staging state independently verified
- [ ] Historical smoke-test claims rerun with current receipt
- [ ] Historical test-total claim rerun with current receipt
- [ ] Security controls independently verified
- [ ] All 28 prerequisite tasks evidenced
- [ ] Promotion approval recorded by authorized decision-maker
- [ ] Timeline supported by a committed schedule artifact

## Success criteria

### Staging

Current staging success is unverified until implementation, tests, security controls, and deployment behavior have current receipts.

### Production

Production promotion remains blocked until the 28 prerequisite tasks, required acceptance criteria, and authorized approval are evidenced.

## Conclusion

The checkout contains OllamaProvider-related implementation and documentation. Current staging and production readiness are unverified. Historical staging claims are preserved above with explicit labels. The promotion timeline is unverified, and the 28-task gate remains open.
