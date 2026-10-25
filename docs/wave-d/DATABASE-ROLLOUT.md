# Database rollout — open items

**Status:** open. Last updated 2026-10-24. Tick a box only when it is done against the **provisioned** PostgreSQL, not a scratch one.

The code for the registry is merged. Nothing below has been run against a real database. Everything so far ran on throwaway local Postgres 16 instances that were deleted afterwards. Tier 1 ruled on 2026-07-14 that an ad-hoc local database is not a conformance signal, and that still holds.

## Done in code

- [x] Migrations 0001–0004, including `versions.source_repo`, `source_ref`, `source_sha`, and `source_path` (#11, #12)
- [x] `toolforge install` checks out the pinned commit, optionally from a subdirectory (#11, #12)
- [x] `npm run version:publish` and `npm run version:backfill` (#13, #14)
- [x] `npm run skill:create` (#15)
- [x] CI runs lint, tests, and the UI build (#6, #9)

## 1. Provision the target

- [ ] A PostgreSQL 15+ instance exists, with `DATABASE_URL` for it
  - **Blocker:** no provisioned instance exists. This gates every item below and the Wave D gate.

## 2. Bring the schema up to date

- [ ] `npm run migrate` applied. It is idempotent and records each file in `schema_migrations`, so only pending files run. Migrations 0003 and 0004 are new since the last gate attempt.

## 3. Load the catalog

Run each command as a dry run first, read the output, then add `--apply`.

- [ ] Check what is already there: `SELECT name, category, owner FROM skills;`
  - `skill:create` never overwrites, so existing rows stay as they are. The command reports any difference from the catalog; read that report before assuming the registry matches.
- [ ] `npm run skill:create`, then `-- --apply`. Creates the four skills and the `utility` and `pipeline` category rows, in one transaction.
- [ ] `npm run version:backfill`, then `-- --apply`. Publishes the four versions from `scripts/backfill-versions.json`.
- [ ] Spot check: `GET /api/v1/categories` shows `pipeline` (2) and `utility` (2), and `toolforge install` works for one local plugin and for `toolforge-core`.

### Tag this repository

- [ ] Create tag `v1.0.0` on commit `d06e842227f76530dfbc50383c47ef8cd3b7cd39`, then change the three local plugin entries in `scripts/backfill-versions.json` from that SHA to `"ref": "v1.0.0"`. Leave `sha` as it is: it guards against a tag that moves.
  - **Blocker:** the automated session that wrote this cannot push tags (the Git server drops the push). Run it yourself:
    `git tag -a v1.0.0 d06e842227f76530dfbc50383c47ef8cd3b7cd39 -m "toolforge-marketplace v1.0.0" && git push origin v1.0.0`
    or create a GitHub release for `v1.0.0` that targets that commit.
  - Do this **before** the real backfill if you want readable refs in the registry. `source_ref` is recorded as given, and published versions are immutable.

## 4. Wave D conformance gate

The gate needs a live run. From `AGENTS.md` in the toolforge repo, decided by Tier 1 on 2026-07-14:

- [ ] Live E2E rerun: `npm run e2e`, five scenarios
- [ ] Live load test: `npm run load:marketplace`, p99 under 200 ms on list, search, trending, and ratings (see `LOAD-TEST.md`)
- [ ] Trending scheduler installed and verified on the target: `npm run trending:schedule` (see `TRENDING-SCHEDULER.md`)
- [ ] `SUCCESS.md` completed and signed by Tier 1 (it is in the toolforge repo, `docs/meta/phase-8-toolforge-marketplace/`, and is still an unsigned template)

## 5. Decisions recorded elsewhere

- [ ] Spec amendment: the commit SHA is the integrity check, replacing `sha256-<hash>` for git-sourced versions. Tier 1 has approved this; the spec change is a separate pull request in the toolforge repo.
- Not built, by decision: the spec's `toolforge submit` and approval flow. Revisit when someone other than the owner publishes skills. Until then, `--apply` on the publish scripts is the act of publishing, and nothing in the API can do it.

## If something looks wrong after `--apply`

Both scripts only add rows, and neither overwrites. To undo a mistake, delete the affected rows by name by hand (a skill, a version, a category row). A deleted version can then be published again under the same tag.
