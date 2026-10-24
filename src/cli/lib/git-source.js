import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PATH_PATTERN = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

/**
 * Same rules as the versions_source_path_format CHECK constraint: a relative,
 * normalized path with no '.' or '..' segments and nothing inside .git.
 */
function isSafeSourcePath(path) {
  return (
    typeof path === 'string' &&
    path.length <= 255 &&
    PATH_PATTERN.test(path) &&
    !path.split('/').some((segment) => segment === '.' || segment === '..' || segment.toLowerCase() === '.git')
  );
}

/**
 * API data is untrusted: re-check the same formats the database enforces before
 * any value reaches git or the filesystem.
 * @returns {{repo: string, sha: string, ref: (string|null), path: (string|null)}|null}
 *   null when the version has no source recorded.
 */
export function readVersionSource(version) {
  const repo = version.source_repo;
  const sha = version.source_sha;
  const path = version.source_path ?? null;
  if (!repo && !sha) {
    if (path !== null) throw new Error('invalid source_path in registry: no source_repo to take it from');
    return null;
  }
  if (typeof repo !== 'string' || !REPO_PATTERN.test(repo) || repo.includes('..')) {
    throw new Error(`invalid source_repo in registry: ${JSON.stringify(repo)}`);
  }
  if (typeof sha !== 'string' || !SHA_PATTERN.test(sha)) {
    throw new Error('invalid source_sha in registry: expected a 40-character lowercase commit SHA');
  }
  if (path !== null && !isSafeSourcePath(path)) {
    throw new Error(`invalid source_path in registry: ${JSON.stringify(path)}`);
  }
  return { repo, sha, ref: version.source_ref || null, path };
}

/** A skill name becomes a directory name, so it must not carry path separators. */
export function assertSafeName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || name.includes('..')) {
    throw new Error(`unsafe skill name for use as a directory: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Check out `sha` from `repo` into `target`, or, when `path` is set, copy just
 * that subdirectory of the commit into `target`. The commit SHA is content
 * addressed, so a checkout whose HEAD equals the pinned SHA is the integrity
 * check. The .git directory never reaches `target`, and a symlink that points
 * outside `target` is refused. On failure `target` is restored to how it was.
 * @param {{repo: string, sha: string, path?: (string|null)}} source
 * @param {string} target must not exist, or be empty
 * @param {{baseUrl?: string}} [opts] baseUrl defaults to TOOLFORGE_GIT_BASE_URL, then GitHub
 */
export async function fetchSource({ repo, sha, path = null }, target, { baseUrl } = {}) {
  const base = (baseUrl || process.env.TOOLFORGE_GIT_BASE_URL || 'https://github.com').replace(/\/+$/, '');
  if (existsSync(target) && readdirSync(target).length > 0) {
    throw new Error(`destination already exists and is not empty: ${target}`);
  }

  const existed = existsSync(target);
  const staging = path ? mkdtempSync(join(tmpdir(), 'tf-src-')) : null;
  try {
    mkdirSync(target, { recursive: true });
    const checkoutDir = staging || target;
    await checkoutCommit(`${base}/${repo}.git`, sha, checkoutDir);

    if (path) {
      copySubdirectory(checkoutDir, path, target);
    } else {
      rmSync(join(target, '.git'), { recursive: true, force: true });
    }
    assertNoEscapingSymlinks(target);
  } catch (error) {
    if (existed) {
      for (const entry of readdirSync(target)) rmSync(join(target, entry), { recursive: true, force: true });
    } else {
      rmSync(target, { recursive: true, force: true });
    }
    if (error.userFacing) throw new Error(error.message);
    const detail = (error.stderr || error.message || '').toString().trim().split('\n').pop();
    throw new Error(`could not fetch ${repo}@${sha.slice(0, 12)}: ${detail}`);
  } finally {
    if (staging) rmSync(staging, { recursive: true, force: true });
  }
}

async function checkoutCommit(url, sha, dir) {
  const git = (...args) => execFileAsync('git', ['-C', dir, ...args], { env: gitEnv() });
  await git('init', '-q');
  await git('fetch', '-q', '--depth', '1', url, sha);
  await git('-c', 'advice.detachedHead=false', 'checkout', '-q', 'FETCH_HEAD');
  const { stdout } = await git('rev-parse', 'HEAD');
  if (stdout.trim() !== sha) {
    throw new Error(`fetched commit ${stdout.trim()} does not match pinned ${sha}`);
  }
}

function copySubdirectory(checkoutDir, path, target) {
  const source = resolve(checkoutDir, path);
  let stat;
  try {
    stat = lstatSync(source);
  } catch {
    throw userError(`path ${path} does not exist at the pinned commit`);
  }
  if (stat.isSymbolicLink()) throw userError(`path ${path} is a symbolic link, not a directory`);
  if (!stat.isDirectory()) throw userError(`path ${path} is not a directory`);
  // Belt and braces: no component of the path may resolve outside the checkout.
  const root = realpathSync(checkoutDir);
  const real = realpathSync(source);
  if (real !== root && !real.startsWith(root + sep)) throw userError(`path ${path} resolves outside the repository`);
  cpSync(source, target, { recursive: true, verbatimSymlinks: true });
}

/**
 * A symlink may point inside the install, but not at anything outside it: after
 * install it would read or write the user's files through the skill directory.
 * Targets are resolved on disk (following every intermediate link), not
 * lexically, so `dir/../x` cannot slip out through a link to the root. A link
 * that resolves to nothing is refused too.
 */
function assertNoEscapingSymlinks(root) {
  const realRoot = realpathSync(root);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const label = full.slice(root.length + 1);
        let real;
        try {
          real = realpathSync(full);
        } catch {
          throw userError(`symbolic link ${label} is broken or loops`);
        }
        if (real !== realRoot && !real.startsWith(realRoot + sep)) {
          throw userError(`symbolic link ${label} points outside the install directory`);
        }
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  };
  walk(root);
}

function userError(message) {
  const error = new Error(message);
  error.userFacing = true;
  return error;
}

// Never prompt for credentials, and ignore the user's global git config.
function gitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
}
