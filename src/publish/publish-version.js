import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSource, isSafeRepo, isSafeSourcePath, resolveRef } from '../cli/lib/git-source.js';
import { getSkillByName, getVersion, insertVersion } from '../db/schema.js';
import { parseVersion } from '../validators/semver.js';

/**
 * Record a version of an existing skill, pinned to a git commit.
 *
 * The ref is resolved to a full commit SHA, then the exact install the CLI would
 * perform is run into a temp directory (fetch, HEAD check, subdirectory, symlink
 * check), so a version is only recorded if it can be installed. Versions are
 * immutable: re-running with the same source is a no-op, and a different source
 * under an existing tag is refused.
 *
 * @param {object} args
 * @param {{query: Function}|null} args.db null skips the registry checks (dry run only)
 * @param {string} args.skill name of a skill already in the registry
 * @param {string} args.tag semver version tag, e.g. 1.2.0
 * @param {string} args.repo GitHub owner/name
 * @param {string} args.ref tag, branch, or full commit SHA to pin
 * @param {string} [args.path] subdirectory of the repo that holds the plugin
 * @param {string} [args.changelog]
 * @param {boolean} [args.apply] write the row; otherwise report what would be written
 * @param {string} [args.baseUrl] git host, default TOOLFORGE_GIT_BASE_URL then GitHub
 * @returns {Promise<{status: 'dry-run'|'created'|'unchanged', record: object, notes: string[]}>}
 */
export async function publishVersion({ db, skill, tag, repo, ref, path = null, changelog = null, apply = false, baseUrl }) {
  if (apply && !db) throw new Error('--apply needs a database connection');
  if (typeof skill !== 'string' || skill.trim() === '') throw new Error('skill name is required');
  if (typeof tag !== 'string' || tag.length > 50) throw new Error(`invalid version tag: ${JSON.stringify(tag)}`);
  parseVersion(tag);
  if (!isSafeRepo(repo)) throw new Error(`invalid repo: ${JSON.stringify(repo)} (expected owner/name)`);
  if (path !== null && !isSafeSourcePath(path)) throw new Error(`invalid path: ${JSON.stringify(path)}`);

  const notes = [];
  const resolved = await resolveRef(repo, ref, { baseUrl });
  if (resolved.note) notes.push(resolved.note);

  const scratch = mkdtempSync(join(tmpdir(), 'tf-publish-'));
  try {
    await fetchSource({ repo, sha: resolved.sha, path }, join(scratch, 'check'), { baseUrl });
  } catch (error) {
    throw new Error(`${repo}@${resolved.sha.slice(0, 12)}${path ? `/${path}` : ''} is not installable: ${error.message}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const record = {
    version_tag: tag,
    release_date: new Date(),
    changelog,
    // versions.checksum is UNIQUE; several plugins can share one commit, so include the path.
    checksum: `git:${resolved.sha}${path ? `:${path}` : ''}`,
    source_repo: repo,
    source_ref: ref,
    source_sha: resolved.sha,
    source_path: path,
  };

  if (!db) {
    notes.push('no database connection: registry checks skipped');
    return { status: 'dry-run', record, notes };
  }

  const skillRow = await getSkillByName(db, skill);
  if (!skillRow) throw new Error(`skill ${JSON.stringify(skill)} is not in the registry; publish creates versions, not skills`);
  record.skill_id = skillRow.id;

  const existing = await getVersion(db, skillRow.id, tag);
  if (existing) {
    const same =
      existing.source_repo === record.source_repo &&
      existing.source_sha === record.source_sha &&
      (existing.source_path ?? null) === record.source_path;
    if (same) return { status: 'unchanged', record: existing, notes: [...notes, `${skill} ${tag} is already published from this source`] };
    throw new Error(
      `${skill} ${tag} is already published from a different source (${existing.source_repo ?? 'none'}@${(existing.source_sha ?? '').slice(0, 12)}); versions are immutable, so publish a new tag`
    );
  }

  if (!apply) return { status: 'dry-run', record, notes };

  try {
    const inserted = await insertVersion(db, record);
    return { status: 'created', record: inserted, notes };
  } catch (error) {
    if (error.code === '23505') {
      throw new Error(`a version with checksum ${record.checksum} already exists (another skill, or this tag, uses the same source)`);
    }
    throw error;
  }
}
