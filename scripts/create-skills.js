#!/usr/bin/env node
// Create the registry skills for the catalog's plugins, so version:backfill has something
// to attach versions to. Dry run by default; --apply writes, in one transaction.
// Needs DATABASE_URL to check or write the registry. Never overwrites an existing skill.

import { fileURLToPath } from 'node:url';
import pg from 'pg';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { createSkills, loadSkillRows } from '../src/publish/skills.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const defaultFile = fileURLToPath(new URL('./backfill-versions.json', import.meta.url));

const argv = yargs(hideBin(process.argv))
  .usage('$0 [--file <list.json>] [--apply]')
  .option('file', { type: 'string', default: defaultFile, describe: 'List with a "skills" section' })
  .option('apply', { type: 'boolean', default: false, describe: 'Write the skills (default is a dry run)' })
  .strict()
  .help()
  .parse();

let pool = null;
let client = null;
try {
  const rows = loadSkillRows(root, argv.file);
  if (process.env.DATABASE_URL) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    client = await pool.connect();
  } else if (argv.apply) {
    throw new Error('--apply needs DATABASE_URL (there is no default, on purpose)');
  }

  const results = await createSkills({ db: client, rows, apply: argv.apply });

  const label = { 'dry-run': 'would create', created: 'created', unchanged: 'already exists', differs: 'EXISTS, DIFFERS' };
  const byName = new Map(rows.map((r) => [r.name, r]));
  for (const { name, status, differences, newCategory } of results) {
    const row = byName.get(name);
    console.log(`${label[status].padEnd(16)} ${name}  [${row.category}]${newCategory ? ' (adds category row)' : ''}`);
    for (const d of differences) console.log(`  ${d}`);
  }
  if (!client) console.log('\nnote: no database connection, so existing skills and categories were not checked');
  const differs = results.filter((r) => r.status === 'differs').length;
  if (differs) console.log(`\n${differs} existing skill(s) differ from the catalog and were left unchanged.`);
  if (!argv.apply) console.log('\ndry run; pass --apply to write');
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  if (client) client.release();
  if (pool) await pool.end();
}
