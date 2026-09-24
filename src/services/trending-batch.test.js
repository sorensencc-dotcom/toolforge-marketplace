import test from 'node:test';
import assert from 'node:assert';
import { computeSpikeScore, runTrendingRefresh, TrendingBatchError } from './trending-batch.js';

test('trending-batch: computeSpikeScore', async (t) => {
  await t.test('zero installs7d -> 0', () => {
    assert.strictEqual(computeSpikeScore({ installs7d: 0, installs30d: 0, prev7d: 0 }), 0);
  });

  await t.test('zero installs7d but nonzero 30d -> 0', () => {
    assert.strictEqual(computeSpikeScore({ installs7d: 0, installs30d: 300, prev7d: 5 }), 0);
  });

  await t.test('div-by-zero floor: installs30d=0 uses expected_7d=1', () => {
    // baseline=0 -> expected=max(0,1)=1 -> ratio=10 -> 10*log2(11)
    const score = computeSpikeScore({ installs7d: 10, installs30d: 0, prev7d: 0 });
    assert.ok(Math.abs(score - 10 * Math.log2(11)) < 1e-9);
  });

  await t.test('steady state (7d ~ 30d/30*7) -> ratio ~1 -> ~installs7d', () => {
    // installs30d=300 -> baseline=10 -> expected=70; installs7d=70 -> ratio=1 -> 70*log2(2)=70
    const score = computeSpikeScore({ installs7d: 70, installs30d: 300, prev7d: 70 });
    assert.ok(Math.abs(score - 70) < 1e-9);
  });

  await t.test('accelerating skill scores higher than steady with same volume', () => {
    const steady = computeSpikeScore({ installs7d: 70, installs30d: 300 });
    const spiking = computeSpikeScore({ installs7d: 70, installs30d: 70 });
    assert.ok(spiking > steady);
  });

  await t.test('monotonic in installs7d for fixed 30d', () => {
    const a = computeSpikeScore({ installs7d: 10, installs30d: 300 });
    const b = computeSpikeScore({ installs7d: 20, installs30d: 300 });
    assert.ok(b > a);
  });

  await t.test('handles missing / undefined args gracefully', () => {
    assert.strictEqual(computeSpikeScore(), 0);
    assert.strictEqual(computeSpikeScore({}), 0);
  });

  await t.test('negative inputs clamped to 0', () => {
    assert.strictEqual(computeSpikeScore({ installs7d: -5, installs30d: 100 }), 0);
  });
});

test('trending-batch: runTrendingRefresh', async (t) => {
  await t.test('returns skillsUpdated + durationMs on success', async () => {
    const db = { query: async () => ({ rowCount: 42, rows: [] }) };
    const result = await runTrendingRefresh(db);
    assert.strictEqual(result.skillsUpdated, 42);
    assert.strictEqual(typeof result.durationMs, 'number');
    assert.ok(result.durationMs >= 0);
  });

  await t.test('wraps db errors in TrendingBatchError', async () => {
    const db = { query: async () => { throw new Error('boom'); } };
    await assert.rejects(() => runTrendingRefresh(db), TrendingBatchError);
  });

  await t.test('single set-based query (no N+1)', async () => {
    let calls = 0;
    const db = { query: async () => { calls++; return { rowCount: 3, rows: [] }; } };
    await runTrendingRefresh(db);
    assert.strictEqual(calls, 1);
  });
});
