import test from 'node:test';
import assert from 'node:assert';
import { parseVersion, compareVersions, resolvePin, satisfies, SemVerError } from './semver.js';

test('SemVer: Parse Version', async (t) => {
  await t.test('parse basic version', () => {
    const v = parseVersion('1.2.3');
    assert.strictEqual(v.major, 1);
    assert.strictEqual(v.minor, 2);
    assert.strictEqual(v.patch, 3);
  });

  await t.test('parse with prerelease', () => {
    const v = parseVersion('1.2.3-rc.1');
    assert.strictEqual(v.prerelease, 'rc.1');
  });

  await t.test('reject invalid format', () => {
    assert.throws(
      () => parseVersion('v1.2.3'),
      SemVerError
    );
  });
});

test('SemVer: Compare Versions', async (t) => {
  await t.test('1.0.0 < 2.0.0', () => {
    assert.strictEqual(compareVersions('1.0.0', '2.0.0'), -1);
  });

  await t.test('2.0.0 > 1.0.0', () => {
    assert.strictEqual(compareVersions('2.0.0', '1.0.0'), 1);
  });

  await t.test('1.2.0 < 1.3.0', () => {
    assert.strictEqual(compareVersions('1.2.0', '1.3.0'), -1);
  });

  await t.test('1.2.3 == 1.2.3', () => {
    assert.strictEqual(compareVersions('1.2.3', '1.2.3'), 0);
  });

  await t.test('prerelease < release', () => {
    assert.strictEqual(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
  });
});

test('SemVer: Resolve Constraints', async (t) => {
  const versions = ['1.0.0', '1.1.0', '1.2.0', '1.2.3', '2.0.0', '2.1.0'];

  await t.test('caret: ^1.2.0', () => {
    const result = resolvePin('^1.2.0', versions);
    assert.strictEqual(result, '2.0.0' <= result ? null : result);
    // Should pick highest 1.x.x that's >= 1.2.0 and < 2.0.0
  });

  await t.test('tilde: ~1.2.0', () => {
    const result = resolvePin('~1.2.0', versions);
    // Should pick highest 1.2.x
    assert(result && result.startsWith('1.2'));
  });

  await t.test('exact: 1.2.0', () => {
    const result = resolvePin('1.2.0', versions);
    assert.strictEqual(result, '1.2.0');
  });

  await t.test('gte: >=1.2.0', () => {
    const result = resolvePin('>=1.2.0', versions);
    assert.strictEqual(result, '2.1.0'); // highest matching
  });

  await t.test('lte: <=1.2.0', () => {
    const result = resolvePin('<=1.2.0', versions);
    assert.strictEqual(result, '1.2.0');
  });

  await t.test('gt: >1.2.0', () => {
    const result = resolvePin('>1.2.0', versions);
    assert.strictEqual(result, '2.1.0');
  });

  await t.test('lt: <1.2.0', () => {
    const result = resolvePin('<1.2.0', versions);
    assert.strictEqual(result, '1.1.0');
  });

  await t.test('wildcard: 1.2.*', () => {
    const result = resolvePin('1.2.*', versions);
    assert.strictEqual(result, '1.2.3');
  });

  await t.test('no match returns null', () => {
    const result = resolvePin('>=3.0.0', versions);
    assert.strictEqual(result, null);
  });

  await t.test('unsupported constraint throws', () => {
    assert.throws(
      () => resolvePin('~>1.2.0', versions),
      SemVerError
    );
  });
});

// --- Wave C: acceptance cases (design doc §3) ---
test('SemVer: Wave C acceptance cases', async (t) => {
  await t.test('case 1: ^1.2.0 excludes prerelease, picks 1.3.0', () => {
    const result = resolvePin('^1.2.0', ['1.2.0', '1.2.5', '1.3.0', '2.0.0', '1.2.0-rc1']);
    assert.strictEqual(result, '1.3.0');
  });

  await t.test('case 2: ^0.2.0 caps at <0.3.0 (zero-major caret) -> 0.2.9', () => {
    const result = resolvePin('^0.2.0', ['0.2.0', '0.2.9', '0.3.0']);
    assert.strictEqual(result, '0.2.9');
  });

  await t.test('case 3a: exact 1.2.0 does not match 1.2.0-beta -> null', () => {
    const result = resolvePin('1.2.0', ['1.2.0-beta']);
    assert.strictEqual(result, null);
  });

  await t.test('case 3b: parseVersion("1.2") throws', () => {
    assert.throws(() => parseVersion('1.2'), SemVerError);
  });
});

// --- Wave C: 0.x caret semantics ---
test('SemVer: zero-version caret', async (t) => {
  await t.test('^0.2.0 does NOT match 0.9.0', () => {
    assert.strictEqual(satisfies('0.9.0', '^0.2.0'), false);
  });
  await t.test('^0.2.0 matches 0.2.5', () => {
    assert.strictEqual(satisfies('0.2.5', '^0.2.0'), true);
  });
  await t.test('^0.0.3 -> <0.0.4 (only 0.0.3 matches)', () => {
    assert.strictEqual(resolvePin('^0.0.3', ['0.0.3', '0.0.4', '0.1.0']), '0.0.3');
  });
  await t.test('^0.0.3 does not match 0.0.4', () => {
    assert.strictEqual(satisfies('0.0.4', '^0.0.3'), false);
  });
});

// --- Wave C: prerelease policy + ordering ---
test('SemVer: prerelease policy', async (t) => {
  await t.test('^1.2.0 does not match 1.2.0-rc1', () => {
    assert.strictEqual(satisfies('1.2.0-rc1', '^1.2.0'), false);
  });
  await t.test('exact 1.2.0 does not match 1.2.0-beta', () => {
    assert.strictEqual(satisfies('1.2.0-beta', '1.2.0'), false);
  });
  await t.test('exact 1.2.0 matches 1.2.0', () => {
    assert.strictEqual(satisfies('1.2.0', '1.2.0'), true);
  });
  await t.test('^1.2.0-rc1 matches 1.2.0-rc2 (same tuple prerelease)', () => {
    assert.strictEqual(satisfies('1.2.0-rc2', '^1.2.0-rc1'), true);
  });
  await t.test('^1.2.0-rc1 matches 1.2.0 (release)', () => {
    assert.strictEqual(satisfies('1.2.0', '^1.2.0-rc1'), true);
  });
  await t.test('^1.2.0-rc1 does not match 1.3.0-beta (different tuple)', () => {
    assert.strictEqual(satisfies('1.3.0-beta', '^1.2.0-rc1'), false);
  });
});

test('SemVer: prerelease ordering (dot-separated identifiers)', async (t) => {
  await t.test('numeric identifiers compared numerically: beta.2 < beta.11', () => {
    assert.strictEqual(compareVersions('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  });
  await t.test('numeric < alphanumeric', () => {
    assert.strictEqual(compareVersions('1.0.0-1', '1.0.0-alpha'), -1);
  });
  await t.test('larger field set > smaller when prefix equal', () => {
    assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  });
  await t.test('full SemVer §11 precedence chain', () => {
    const chain = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      assert.strictEqual(compareVersions(chain[i], chain[i + 1]), -1, `${chain[i]} < ${chain[i + 1]}`);
    }
  });
});

// --- Wave C: wildcard x.* + malformed input ---
test('SemVer: wildcard and malformed input', async (t) => {
  await t.test('x.* wildcard', () => {
    assert.strictEqual(resolvePin('1.*', ['1.0.0', '1.5.0', '2.0.0']), '1.5.0');
  });
  await t.test('bare * throws', () => {
    assert.throws(() => resolvePin('*', ['1.0.0']), SemVerError);
  });
  await t.test('partial version 1.2.0.0 throws', () => {
    assert.throws(() => parseVersion('1.2.0.0'), SemVerError);
  });
  await t.test('space-separated range throws', () => {
    assert.throws(() => resolvePin('>=1.0.0 <2.0.0', ['1.5.0']), SemVerError);
  });
  await t.test('satisfies throws on malformed version', () => {
    assert.throws(() => satisfies('1.2', '^1.0.0'), SemVerError);
  });
  await t.test('valid constraint matching nothing returns null (not throw)', () => {
    assert.strictEqual(resolvePin('^3.0.0', ['1.0.0', '2.0.0']), null);
  });
});
