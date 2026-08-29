# Remaining Phase 3 work

## Blocked on authoritative staging inputs

- [ ] Obtain staged source and compiled L0/L1/L2 artifacts for active generation `20260716_153612_62d4141f`.
- [ ] Populate tier index with verified records and validate source/tier hashes.
- [ ] Confirm authoritative tier-index path, filename, schema version, and publication owner.
- [ ] Publish the tier-index artifact through the approved staging process; record artifact hash and creation timestamp.
- [ ] Validate `owner_charlie_001` against the actual ownership/connector schema.
- [ ] Record escalation contact, on-call path, publication responsibility, and rollback responsibility.

## Live integration coverage

- [ ] Add live tests for pointer replacement during active reads.
- [ ] Add live tests for missing, unreadable, and corrupt generation metadata.
- [ ] Add live tests for pointer/manifest, source-hash, and tier-hash mismatches.
- [ ] Add live tests for stale L0/L1 records and immutable L2 reads.
- [ ] Add live tests for missing, corrupt, and write-attempted SQLite indexes.
- [ ] Add live MCP tests for `initialize`, `resources/list`, and `resources/read` against populated staging data.

## Release and deployment

- [ ] Create or identify the authoritative PR for `feat/viking-tier-index`.
- [ ] Post verified test, benchmark, artifact, ownership, failure-matrix, and rollback evidence.
- [ ] Verify staging deployment and MCP startup against the authoritative artifact.
- [ ] Execute rollback smoke test and capture telemetry evidence.
- [ ] Resolve or document Wiki QA browser-fixture shutdown hang.