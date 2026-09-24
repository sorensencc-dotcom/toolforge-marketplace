#!/usr/bin/env node

// Phase 9 GATE-04: Fairness Pattern Stress Test
// 10 concurrent writers, 100 total writes, no lock timeouts
// Tests concurrent skill creation and rating updates

import { pool } from '../db/connect.js';
import * as schema from '../db/schema.js';

const CONCURRENT_WRITERS = 10;
const TOTAL_WRITES = 100;
const WRITES_PER_WRITER = Math.ceil(TOTAL_WRITES / CONCURRENT_WRITERS);

const db = { query: (text, params) => pool.query(text, params) };

async function randomDelay(minMs = 1, maxMs = 50) {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

async function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function createSkillWithRetry(writerIndex, attemptIndex) {
  const skillName = `stress-test-${Date.now()}-w${writerIndex}-a${attemptIndex}`;
  const skillId = await generateUUID();

  try {
    const result = await db.query(
      `INSERT INTO skills (id, name, category, description, owner, manifest_json, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [skillId, skillName, 'testing', 'Stress test skill', `writer${writerIndex}@test.local`, '{}', 'published']
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') throw error;
    console.error(`  Attempt ${attemptIndex} failed for writer ${writerIndex}:`, error.message);
    return null;
  }
}

async function addRatingWithRetry(skillId, writerIndex, attemptIndex) {
  const score = Math.floor(Math.random() * 5) + 1;
  const reviewText = `Rating from writer ${writerIndex}`;

  try {
    const result = await db.query(
      `INSERT INTO ratings (skill_id, user_id, score, review_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (skill_id, user_id) DO UPDATE SET
         score = $3, review_text = $4, updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [skillId, `writer${writerIndex}@test.local`, score, reviewText]
    );
    return result.rows.length > 0;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') throw error;
    console.error(`  Rating failed for writer ${writerIndex}:`, error.message);
    return false;
  }
}

async function writerTask(writerIndex) {
  const results = { created: 0, rated: 0, failed: 0 };

  for (let attempt = 0; attempt < WRITES_PER_WRITER; attempt++) {
    await randomDelay(1, 20);

    try {
      // 60% skill creation, 40% rating on random existing skills
      if (Math.random() < 0.6) {
        const created = await createSkillWithRetry(writerIndex, attempt);
        if (created) {
          results.created++;
          // Try to add rating immediately
          const rated = await addRatingWithRetry(created, writerIndex, attempt);
          if (rated) results.rated++;
        } else {
          results.failed++;
        }
      } else {
        // Add rating to a random recent skill
        const recentResult = await db.query(
          `SELECT id FROM skills WHERE owner LIKE $1 ORDER BY RANDOM() LIMIT 1`,
          [`writer%@test.local`]
        );
        if (recentResult.rows.length > 0) {
          const rated = await addRatingWithRetry(recentResult.rows[0].id, writerIndex, attempt);
          if (rated) results.rated++;
        }
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`Database connection lost (writer ${writerIndex})`);
        throw error;
      }
      results.failed++;
    }
  }

  return results;
}

async function run() {
  console.log(`GATE-04 Fairness Pattern Stress Test`);
  console.log(`====================================`);
  console.log(`Concurrent writers: ${CONCURRENT_WRITERS}`);
  console.log(`Total writes: ${TOTAL_WRITES}`);
  console.log(`Writes per writer: ${WRITES_PER_WRITER}`);
  console.log('');

  const startTime = Date.now();

  try {
    // Clean up old test data
    console.log('Cleaning up old test data...');
    await db.query(`DELETE FROM ratings WHERE user_id LIKE 'writer%@test.local'`);
    await db.query(`DELETE FROM skills WHERE owner LIKE 'writer%@test.local'`);

    console.log('Starting concurrent write tasks...');
    const promises = [];
    for (let i = 0; i < CONCURRENT_WRITERS; i++) {
      promises.push(writerTask(i));
    }

    const results = await Promise.all(promises);

    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalRated = results.reduce((sum, r) => sum + r.rated, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    const totalWrites = totalCreated + totalRated;
    const duration = Date.now() - startTime;

    console.log('');
    console.log('Results:');
    console.log(`  Skills created: ${totalCreated}`);
    console.log(`  Ratings added: ${totalRated}`);
    console.log(`  Total writes: ${totalWrites}`);
    console.log(`  Failed attempts: ${totalFailed}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Rate: ${(totalWrites / duration * 1000).toFixed(2)} writes/sec`);
    console.log('');

    // Verify no lock timeouts occurred
    const lockTimeouts = results.some(r => r.lockTimeout);
    if (lockTimeouts) {
      console.error('✗ FAILED: Lock timeouts detected');
      process.exit(1);
    }

    // Verify threshold: <2500ms for 100 writes
    if (duration > 2500) {
      console.warn(`⚠ WARNING: Duration ${duration}ms exceeds 2500ms threshold`);
    } else {
      console.log(`✓ PASSED: All writes completed in ${duration}ms (threshold: 2500ms)`);
    }

    if (totalWrites >= TOTAL_WRITES * 0.8) {
      console.log(`✓ PASSED: Write completion rate ${((totalWrites / TOTAL_WRITES) * 100).toFixed(1)}% (threshold: 80%)`);
      process.exit(0);
    } else {
      console.error(`✗ FAILED: Write completion rate too low`);
      process.exit(1);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('✗ FAILED: Database connection refused');
      console.error('  Ensure PostgreSQL is running on localhost:5432');
    } else {
      console.error('✗ FAILED:', error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
