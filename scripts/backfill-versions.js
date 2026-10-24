#!/usr/bin/env node
// Publish the versions listed in scripts/backfill-versions.json (see publish-version.js).
// Dry run by default; --apply writes. Needs DATABASE_URL to check or write the registry.

import { fileURLToPath } from 'node:url';
import pg from 'pg';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { loadBackfillList, runBackfill } from '../src/publish/backfill.js';

const defaultFile = fileURLToPath(new URL('./backfill-versions.json', import.meta.url));

const argv = yargs(hideBin(process.argv))
  .usage('$0 [--file <list.json>] [--apply]')
  .option('file', { type: 'string', default: defaultFile, describe: 'Backfill list' })
  .option('apply', { type: 'boolean', default: false, describe: 'Write the versions (default is a dry run)' })
  .strict()
  .help()
  .parse();

let pool = null;
try {
  if (process.env.DATABASE_URL) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  else if (argv.apply) throw new Error('--apply needs DATABASE_URL (there is no default, on purpose)');

  const entries = loadBackfillList(argv.file);
  const results = await runBackfill({ db: pool, entries, apply: argv.apply });

  const label = { 'dry-run': 'would publish', created: 'published', unchanged: 'already published', failed: 'FAILED' };
  for (const { entry, status, record, notes, error } of results) {
    console.log(`${label[status].padEnd(17)} ${entry.skill} ${entry.tag}`);
    if (record) console.log(`  ${record.source_repo}${record.source_path ? `/${record.source_path}` : ''}@${record.source_sha}`);
    for (const note of notes) console.log(`  note: ${note}`);
    if (error) console.log(`  ${error}`);
  }
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(`\n${results.length - failed} of ${results.length} ok${argv.apply ? '' : ' (dry run; pass --apply to write)'}`);
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
