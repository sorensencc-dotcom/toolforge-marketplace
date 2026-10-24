import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

const execFileAsync = promisify(execFile);

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * API data is untrusted: re-check the same formats the database enforces before
 * any value reaches git or the filesystem.
 * @returns {{repo: string, sha: string, ref: (string|null)}|null} null when the
 *   version has no source recorded.
 */
export function readVersionSource(version) {
  const repo = version.source_repo;
  const sha = version.source_sha;
  if (!repo && !sha) return null;
  if (typeof repo !== 'string' || !REPO_PATTERN.test(repo) || repo.includes('..')) {
    throw new Error(`invalid source_repo in registry: ${JSON.stringify(repo)}`);
  }
  if (typeof sha !== 'string' || !SHA_PATTERN.test(sha)) {
    throw new Error('invalid source_sha in registry: expected a 40-character lowercase commit SHA');
  }
  return { repo, sha, ref: version.source_ref || null };
}

/** A skill name becomes a directory name, so it must not carry path separators. */
export function assertSafeName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || name.includes('..')) {
    throw new Error(`unsafe skill name for use as a directory: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Check out `sha` from `repo` into `target`. The commit SHA is content addressed,
 * so a checkout whose HEAD equals the pinned SHA is the integrity check. The .git
 * directory is removed afterwards. On failure `target` is removed.
 * @param {{repo: string, sha: string}} source
 * @param {string} target must not exist, or be empty
 * @param {{baseUrl?: string}} [opts] baseUrl defaults to TOOLFORGE_GIT_BASE_URL, then GitHub
 */
export async function fetchSource({ repo, sha }, target, { baseUrl } = {}) {
  const base = (baseUrl || process.env.TOOLFORGE_GIT_BASE_URL || 'https://github.com').replace(/\/+$/, '');
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`destination already exists and is not empty: ${target}`);
  }

  const existed = existsSync(target);
  mkdirSync(target, { recursive: true });
  const git = (...args) => execFileAsync('git', ['-C', target, ...args], { env: gitEnv() });

  try {
    await git('init', '-q');
    await git('fetch', '-q', '--depth', '1', `${base}/${repo}.git`, sha);
    await git('-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD');
    const { stdout } = await git('rev-parse', 'HEAD');
    if (stdout.trim() !== sha) {
      throw new Error(`fetched commit ${stdout.trim()} does not match pinned ${sha}`);
    }
    rmSync(`${target}/.git`, { recursive: true, force: true });
  } catch (error) {
    if (existed) {
      for (const entry of readdirSync(target)) rmSync(`${target}/${entry}`, { recursive: true, force: true });
    } else {
      rmSync(target, { recursive: true, force: true });
    }
    const detail = (error.stderr || error.message || '').toString().trim().split('\n').pop();
    throw new Error(`could not fetch ${repo}@${sha.slice(0, 12)}: ${detail}`);
  }
}

// Never prompt for credentials, and ignore the user's global git config.
function gitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}
