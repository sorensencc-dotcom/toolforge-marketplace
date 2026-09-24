// SemVer Version Pin Resolver
// Resolves version constraints: ^1.2.0, ~1.2.0, 1.2.0, >=1.2.0, x.y.*, etc.
// Strict SemVer 2.0.0 core: MAJOR.MINOR.PATCH with optional -prerelease and +build.

export class SemVerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SemVerError';
  }
}

/**
 * Parse a strict SemVer version string.
 * @param {string} version
 * @returns {{major:number, minor:number, patch:number, prerelease:string|null, build:string|null, metadata:string|null}}
 * @throws {SemVerError} on malformed input (e.g. partial '1.2', extra segment '1.2.0.0').
 */
export function parseVersion(version) {
  if (typeof version !== 'string') {
    throw new SemVerError(`Invalid version format: ${version}`);
  }
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new SemVerError(`Invalid version format: ${version}`);
  }
  const [, major, minor, patch, prerelease, build] = match;
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease || null,
    build: build || null,
    metadata: build || null, // backward-compat alias
  };
}

/**
 * Compare two dot-separated prerelease identifier strings per SemVer §11.4.
 * numeric identifiers compared numerically; alphanumeric lexically (ASCII);
 * numeric < alphanumeric; a larger set of fields > a smaller when all
 * preceding identifiers are equal.
 * @returns {-1|0|1}
 */
function comparePrerelease(a, b) {
  // No prerelease outranks a prerelease (release > prerelease).
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const idsA = a.split('.');
  const idsB = b.split('.');
  const len = Math.min(idsA.length, idsB.length);

  for (let i = 0; i < len; i++) {
    const x = idsA[i];
    const y = idsB[i];
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);

    if (xNum && yNum) {
      const nx = parseInt(x, 10);
      const ny = parseInt(y, 10);
      if (nx !== ny) return nx > ny ? 1 : -1;
    } else if (xNum && !yNum) {
      return -1; // numeric < alphanumeric
    } else if (!xNum && yNum) {
      return 1;
    } else {
      if (x !== y) return x < y ? -1 : 1; // lexical ASCII
    }
  }

  if (idsA.length !== idsB.length) return idsA.length > idsB.length ? 1 : -1;
  return 0;
}

/**
 * Compare two versions. Build metadata is ignored (SemVer §10).
 * @returns {-1|0|1}
 */
export function compareVersions(v1, v2) {
  const a = parseVersion(v1);
  const b = parseVersion(v2);

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  return comparePrerelease(a.prerelease, b.prerelease);
}

// --- Constraint parsing -----------------------------------------------------

/**
 * Compute the caret upper bound with correct 0.x semantics.
 *   ^1.2.3 -> <2.0.0   (major is breaking axis)
 *   ^0.2.3 -> <0.3.0   (major=0: minor is breaking axis)
 *   ^0.0.3 -> <0.0.4   (major=minor=0: patch is breaking axis)
 */
function caretUpper(major, minor, patch) {
  if (major > 0) return `${major + 1}.0.0`;
  if (minor > 0) return `0.${minor + 1}.0`;
  return `0.0.${patch + 1}`;
}

/**
 * Parse a constraint into a matcher. Bounds are half-open [lower, upper).
 * `anchor` is the [major,minor,patch] tuple that a prerelease version must
 * match to be admissible (only set when the constraint itself is a prerelease
 * or an exact prerelease); null means "no prerelease versions admitted".
 * @throws {SemVerError} on unsupported/malformed constraint.
 */
function parseConstraint(constraint) {
  if (typeof constraint !== 'string' || constraint.trim() === '') {
    throw new SemVerError(`Unsupported version constraint: ${constraint}`);
  }

  const core = '(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?';
  let m;

  // Caret
  if ((m = constraint.match(new RegExp(`^\\^${core}$`)))) {
    const [, ma, mi, pa, pre] = m;
    const major = +ma, minor = +mi, patch = +pa;
    const lower = constraint.slice(1);
    const upper = caretUpper(major, minor, patch);
    const anchor = pre ? { major, minor, patch } : null;
    return { kind: 'range', lower, upper, lowerInclusive: true, upperInclusive: false, anchor };
  }

  // Tilde: >=x.y.z <x.(y+1).0
  if ((m = constraint.match(new RegExp(`^~${core}$`)))) {
    const [, ma, mi, pa, pre] = m;
    const major = +ma, minor = +mi, patch = +pa;
    const lower = constraint.slice(1);
    const upper = `${major}.${minor + 1}.0`;
    const anchor = pre ? { major, minor, patch } : null;
    return { kind: 'range', lower, upper, lowerInclusive: true, upperInclusive: false, anchor };
  }

  // Comparators
  if ((m = constraint.match(new RegExp(`^>=${core}$`)))) {
    const [, ma, mi, pa, pre] = m;
    return { kind: 'range', lower: constraint.slice(2), upper: null, lowerInclusive: true, upperInclusive: false, anchor: pre ? { major: +ma, minor: +mi, patch: +pa } : null };
  }
  if ((m = constraint.match(new RegExp(`^<=${core}$`)))) {
    const [, ma, mi, pa, pre] = m;
    return { kind: 'range', lower: null, upper: constraint.slice(2), lowerInclusive: true, upperInclusive: true, anchor: pre ? { major: +ma, minor: +mi, patch: +pa } : null };
  }
  if ((m = constraint.match(new RegExp(`^>${core}$`)))) {
    const [, ma, mi, pa, pre] = m;
    return { kind: 'range', lower: constraint.slice(1), upper: null, lowerInclusive: false, upperInclusive: false, anchor: pre ? { major: +ma, minor: +mi, patch: +pa } : null };
  }
  if ((m = constraint.match(new RegExp(`^<${core}$`)))) {
    const [, ma, mi, pa, pre] = m;
    return { kind: 'range', lower: null, upper: constraint.slice(1), lowerInclusive: false, upperInclusive: false, anchor: pre ? { major: +ma, minor: +mi, patch: +pa } : null };
  }

  // Wildcard x.y.*  -> [x.y.0, x.(y+1).0)
  if ((m = constraint.match(/^(\d+)\.(\d+)\.\*$/))) {
    const major = +m[1], minor = +m[2];
    return { kind: 'range', lower: `${major}.${minor}.0`, upper: `${major}.${minor + 1}.0`, lowerInclusive: true, upperInclusive: false, anchor: null };
  }
  // Wildcard x.*  -> [x.0.0, (x+1).0.0)
  if ((m = constraint.match(/^(\d+)\.\*$/))) {
    const major = +m[1];
    return { kind: 'range', lower: `${major}.0.0`, upper: `${major + 1}.0.0`, lowerInclusive: true, upperInclusive: false, anchor: null };
  }

  // Exact
  if ((m = constraint.match(new RegExp(`^${core}$`)))) {
    return { kind: 'exact', version: constraint };
  }

  throw new SemVerError(`Unsupported version constraint: ${constraint}`);
}

function matcherTest(parsed, version) {
  const vp = parseVersion(version); // throws on malformed version

  if (parsed.kind === 'exact') {
    return compareVersions(version, parsed.version) === 0;
  }

  // Prerelease gating: a prerelease version is admissible only if the
  // constraint anchors a prerelease at the same [major,minor,patch] tuple.
  if (vp.prerelease) {
    const a = parsed.anchor;
    if (!a || a.major !== vp.major || a.minor !== vp.minor || a.patch !== vp.patch) {
      return false;
    }
  }

  if (parsed.lower !== null) {
    const c = compareVersions(version, parsed.lower);
    if (parsed.lowerInclusive ? c < 0 : c <= 0) return false;
  }
  if (parsed.upper !== null) {
    const c = compareVersions(version, parsed.upper);
    if (parsed.upperInclusive ? c > 0 : c >= 0) return false;
  }
  return true;
}

/**
 * Does a concrete version satisfy a constraint? Prerelease-aware.
 * @param {string} version
 * @param {string} constraint
 * @returns {boolean}
 * @throws {SemVerError} if version or constraint is malformed/unsupported.
 */
export function satisfies(version, constraint) {
  const parsed = parseConstraint(constraint); // throws on bad constraint
  return matcherTest(parsed, version);         // throws on bad version
}

/**
 * Resolve the highest available version satisfying a constraint.
 * @param {string} constraint
 * @param {string[]} availableVersions
 * @returns {string|null} highest satisfying version, or null if none match.
 * @throws {SemVerError} if the constraint is malformed/unsupported.
 */
export function resolvePin(constraint, availableVersions) {
  const parsed = parseConstraint(constraint); // validate constraint up front

  const matching = (availableVersions || []).filter((v) => {
    try {
      return matcherTest(parsed, v);
    } catch {
      // Skip individual malformed available versions (bad data, not bad query).
      return false;
    }
  });

  if (matching.length === 0) return null;

  matching.sort((a, b) => compareVersions(b, a));
  return matching[0];
}
