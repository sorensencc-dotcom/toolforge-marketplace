import test from 'node:test';
import assert from 'node:assert';
import { logInstall, updateTrendingForSkill, getInstallStats, getInstallSuccess, AnalyticsError } from './analytics.js';

test('Analytics Service', async (t) => {
  const mockDb = {
    query: async () => {
      // Mock DB disabled for unit tests
      throw new Error('Database not available in test');
    },
  };

  await t.test('logInstall validates inputs', async () => {
    assert.rejects(
      () => logInstall(mockDb, { userId: 'user@example.com' }),
      AnalyticsError
    );
  });

  await t.test('logInstall requires userId', async () => {
    assert.rejects(
      () => logInstall(mockDb, { skillId: 'skill-id' }),
      AnalyticsError
    );
  });

  await t.test('updateTrendingForSkill validates skillId', async () => {
    assert.rejects(
      () => updateTrendingForSkill(mockDb),
      AnalyticsError
    );
  });

  await t.test('getBatchTrending accepts window param', async () => {
    try {
      await getBatchTrending(mockDb, { window: '30d', limit: 50 });
    } catch (error) {
      // Expected: no DB
      assert.strictEqual(error.message, 'Failed to fetch trending: Database not available in test');
    }
  });

  await t.test('getInstallStats validates skillId', async () => {
    assert.rejects(
      () => getInstallStats(mockDb),
      AnalyticsError
    );
  });

  await t.test('getInstallSuccess validates skillId', async () => {
    assert.rejects(
      () => getInstallSuccess(mockDb),
      AnalyticsError
    );
  });
});

// Import required for test
import { getBatchTrending } from './analytics.js';
