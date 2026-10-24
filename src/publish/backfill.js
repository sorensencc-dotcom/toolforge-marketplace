import { readFileSync } from 'node:fs';
import { isFullSha } from '../cli/lib/git-source.js';
import { publishVersion } from './publish-version.js';

/**
 * Read and shape-check a backfill list: { versions: [{ skill, tag, repo, ref, sha, path? }] }.
 * `sha` is the commit `ref` must resolve to, so a moved tag cannot publish different files.
 */
export function loadBackfillList(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.versions) || parsed.versions.length === 0) {
    throw new Error(`${file}: expected { "versions": [ ... ] } with at least one entry`);
  }
  const seen = new Set();
  parsed.versions.forEach((entry, i) => {
    const where = `${file} versions[${i}]`;
    for (const key of ['skill', 'tag', 'repo', 'ref', 'sha']) {
      if (typeof entry[key] !== 'string' || entry[key] === '') throw new Error(`${where}: ${key} is required`);
    }
    if (!isFullSha(entry.sha)) throw new Error(`${where}: sha must be a 40-character lowercase commit SHA`);
    if (entry.path !== undefined && typeof entry.path !== 'string') throw new Error(`${where}: path must be a string`);
    const id = `${entry.skill}@${entry.tag}`;
    if (seen.has(id)) throw new Error(`${where}: duplicate entry for ${id}`);
    seen.add(id);
  });
  return parsed.versions;
}

/**
 * Publish every entry. One failing entry does not stop the rest, so a re-run after
 * a fix finishes the job; publishing is idempotent.
 * @returns {Promise<Array<{entry: object, status: string, record?: object, notes: string[], error?: string}>>}
 */
export async function runBackfill({ db, entries, apply = false, baseUrl }) {
  const results = [];
  for (const entry of entries) {
    try {
      const { status, record, notes } = await publishVersion({
        db,
        skill: entry.skill,
        tag: entry.tag,
        repo: entry.repo,
        ref: entry.ref,
        path: entry.path ?? null,
        expectSha: entry.sha,
        changelog: entry.changelog ?? null,
        apply,
        baseUrl,
      });
      results.push({ entry, status, record, notes });
    } catch (error) {
      results.push({ entry, status: 'failed', notes: [], error: error.message });
    }
  }
  return results;
}
