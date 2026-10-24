import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

export const DEFAULT_FILES = { 'SKILL.md': '# demo\n' };

/**
 * A bare repo at <base>/acme/demo.git with one commit on main. `files` maps a repo
 * path to its content, or to { symlink: target } for a symbolic link.
 *
 * Refs created on that commit: lightweight tag `light`, annotated tag `annot`
 * (a tag object, so it must be peeled), and tag `dual`. Branch `dual` has one more
 * commit, so the tag and the branch of that name disagree; its tip is `branchSha`.
 * Returns { base, sha, branchSha }.
 */
export function makeGitFixture(files = DEFAULT_FILES) {
  const base = mkdtempSync(resolve(tmpdir(), 'tf-git-'));
  const work = resolve(base, 'work');
  mkdirSync(work);
  const git = (cwd, ...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    }).trim();
  git(work, 'init', '-q', '-b', 'main');
  git(work, 'config', 'user.email', 'test@example.com');
  git(work, 'config', 'user.name', 'Test');
  for (const [path, content] of Object.entries(files)) {
    const full = resolve(work, path);
    mkdirSync(dirname(full), { recursive: true });
    if (typeof content === 'object') symlinkSync(content.symlink, full);
    else writeFileSync(full, content);
  }
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'init');
  const sha = git(work, 'rev-parse', 'HEAD');
  git(work, 'tag', 'light');
  git(work, 'tag', '-a', 'annot', '-m', 'annotated');
  git(work, 'tag', 'dual');
  git(work, 'checkout', '-q', '-b', 'dual');
  writeFileSync(resolve(work, 'extra.txt'), 'extra\n');
  git(work, 'add', '-A');
  git(work, 'commit', '-q', '-m', 'branch only');
  const branchSha = git(work, 'rev-parse', 'HEAD');
  git(work, 'checkout', '-q', 'main');
  mkdirSync(resolve(base, 'acme'));
  git(base, 'clone', '-q', '--bare', work, resolve(base, 'acme', 'demo.git'));
  return { base, sha, branchSha };
}
