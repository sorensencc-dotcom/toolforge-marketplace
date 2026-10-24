#!/usr/bin/env node
// Record a skill version pinned to a git commit, so `toolforge install` can fetch it.
// Dry run by default; --apply writes. Needs DATABASE_URL to check or write the registry.

import pg from 'pg';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { publishVersion } from '../src/publish/publish-version.js';

const argv = yargs(hideBin(process.argv))
  .usage('$0 --skill <name> --tag <semver> --repo <owner/name> --ref <tag|branch|sha> [--path <dir>] [--apply]')
  .option('skill', { type: 'string', demandOption: true, describe: 'Skill already in the registry' })
  .option('tag', { type: 'string', demandOption: true, describe: 'Version tag, e.g. 1.2.0' })
  .option('repo', { type: 'string', demandOption: true, describe: 'GitHub owner/name' })
  .option('ref', { type: 'string', demandOption: true, describe: 'Tag, branch, or full commit SHA to pin' })
  .option('path', { type: 'string', describe: 'Subdirectory of the repo that holds the plugin' })
  .option('changelog', { type: 'string', describe: 'Changelog text for this version' })
  .option('apply', { type: 'boolean', default: false, describe: 'Write the version (default is a dry run)' })
  .strict()
  .help()
  .parse();

let pool = null;
try {
  if (process.env.DATABASE_URL) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  else if (argv.apply) throw new Error('--apply needs DATABASE_URL (there is no default, on purpose)');

  const { status, record, notes } = await publishVersion({
    db: pool,
    skill: argv.skill,
    tag: argv.tag,
    repo: argv.repo,
    ref: argv.ref,
    path: argv.path ?? null,
    changelog: argv.changelog ?? null,
    apply: argv.apply,
  });

  for (const note of notes) console.log(`note: ${note}`);
  const source = `${record.source_repo}${record.source_path ? `/${record.source_path}` : ''}@${record.source_sha}`;
  const label = { 'dry-run': 'Would publish (dry run; pass --apply to write)', created: 'Published', unchanged: 'Already published' }[status];
  console.log(`${label}: ${argv.skill} ${record.version_tag}`);
  console.log(`  source:   ${source}`);
  console.log(`  checksum: ${record.checksum}`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
