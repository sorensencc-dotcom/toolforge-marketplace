#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost/marketplace_dev';
const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});

async function getMigrationHistory(client) {
  try {
    const result = await client.query(
      'SELECT name FROM schema_migrations ORDER BY name'
    );
    return result.rows.map(row => row.name);
  } catch {
    // Table doesn't exist yet
    return [];
  }
}

async function createMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function runMigration(client, filename, content) {
  try {
    await client.query(content);
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1)',
      [filename]
    );
    console.log(`✓ ${filename}`);
  } catch (err) {
    console.error(`✗ ${filename}: ${err.message}`);
    throw err;
  }
}

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('Setting up migrations table...');
    await createMigrationsTable(client);

    console.log('Fetching migration history...');
    const executed = await getMigrationHistory(client);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`Found ${files.length} migration file(s)`);

    const pending = files.filter(f => !executed.includes(f));

    if (pending.length === 0) {
      console.log('Database is up to date.');
      return;
    }

    console.log(`Running ${pending.length} pending migration(s)...`);
    console.log('');

    for (const file of pending) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      await runMigration(client, file, content);
    }

    console.log('');
    console.log('All migrations applied successfully.');
  } finally {
    await client.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
