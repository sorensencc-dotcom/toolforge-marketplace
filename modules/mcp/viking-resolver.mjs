import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ERROR_CODES = Object.freeze({
  INVALID_URI: 'INVALID_URI',
  NAMESPACE_REJECTED: 'NAMESPACE_REJECTED',
  PATH_TRAVERSAL_REJECTED: 'PATH_TRAVERSAL_REJECTED',
  SNAPSHOT_UNAVAILABLE: 'SNAPSHOT_UNAVAILABLE',
  MANIFEST_INVALID: 'MANIFEST_INVALID',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  TIER_UNAVAILABLE: 'TIER_UNAVAILABLE',
  INTEGRITY_FAILED: 'INTEGRITY_FAILED',
  RESOURCE_TOO_LARGE: 'RESOURCE_TOO_LARGE',
});

export class VikingError extends Error {
  constructor(code, message, data = {}) {
    super(message);
    this.name = 'VikingError';
    this.code = code;
    this.data = data;
  }
}

function normalizeRelative(raw) {
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { throw new VikingError(ERROR_CODES.INVALID_URI, 'URI contains invalid encoding'); }
  if (decoded === '') return '';
  if (decoded.includes('\\') || path.posix.isAbsolute(decoded) || decoded.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new VikingError(ERROR_CODES.PATH_TRAVERSAL_REJECTED, 'Path is not a safe relative path');
  }
  const normalized = path.posix.normalize(decoded);
  if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('\0')) {
    throw new VikingError(ERROR_CODES.PATH_TRAVERSAL_REJECTED, 'Path escapes the virtual root');
  }
  return normalized;
}

export function parseUri(input, configuredVault, { allowLegacy = false } = {}) {
  if (typeof input !== 'string' || !input.startsWith('viking://')) {
    throw new VikingError(ERROR_CODES.INVALID_URI, 'URI must use viking://');
  }
  const parts = input.slice('viking://'.length).split('/');
  let vault = parts.shift();
  let layer = parts.shift();
  if (allowLegacy && ['sources', 'wiki', 'schema'].includes(vault)) {
    parts.unshift(layer);
    layer = vault;
    vault = configuredVault;
  }
  if (!vault || vault !== configuredVault) {
    throw new VikingError(ERROR_CODES.NAMESPACE_REJECTED, 'Vault namespace is not active');
  }
  if (!['sources', 'wiki', 'schema'].includes(layer)) {
    throw new VikingError(ERROR_CODES.INVALID_URI, 'Unknown virtual layer');
  }
  const relativePath = normalizeRelative(parts.join('/'));
  return { vault, layer, relativePath, uri: `viking://${vault}/${layer}/${relativePath}` };
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function createResolver({ vaultRoot, vaultName, snapshotId, snapshotRoot: pinnedRoot, snapshotManifest, layerRoots, tierIndex = {}, maxBytes = 1024 * 1024, allowLegacy = false }) {
  if (!vaultRoot || !vaultName || !snapshotId) throw new Error('vaultRoot, vaultName, and snapshotId are required');
  if (!/^\d{8}[-_]\d{6}(?:_[A-Za-z0-9]+)?$/.test(snapshotId)) throw new VikingError(ERROR_CODES.SNAPSHOT_UNAVAILABLE, 'Snapshot ID is not timestamped', { snapshot_id: snapshotId });
  const roots = { sources: 'sources', wiki: 'wiki', schema: 'schema', ...layerRoots };
  const snapshotRoot = pinnedRoot ? path.resolve(pinnedRoot) : path.resolve(vaultRoot, '_kb-sync-staging', snapshotId);
  const rootReal = fs.existsSync(snapshotRoot) ? fs.realpathSync(snapshotRoot) : null;
  const manifestFile = rootReal ? path.join(rootReal, 'FILES.manifest.txt') : null;
  const manifestEntries = new Set();
  const contentCache = new Map();
  if (manifestFile && fs.existsSync(manifestFile)) {
    for (const line of fs.readFileSync(manifestFile, 'utf8').split(/\r?\n/)) {
      const entry = line.trim();
      if (entry && !entry.startsWith('#')) manifestEntries.add(entry.replaceAll('\\', '/'));
    }
  }
  if (manifestEntries.size === 0 && Array.isArray(snapshotManifest?.files)) {
    for (const entry of snapshotManifest.files) if (typeof entry === 'string' && entry) manifestEntries.add(entry.replaceAll('\\\\', '/'));
  }

  function resolve(input) {
    const parsed = parseUri(input, vaultName, { allowLegacy });
    if (!rootReal) throw new VikingError(ERROR_CODES.SNAPSHOT_UNAVAILABLE, 'Selected snapshot is unavailable', { snapshot_id: snapshotId });
    if (manifestEntries.size === 0) throw new VikingError(ERROR_CODES.MANIFEST_INVALID, 'Snapshot manifest is missing or empty', { snapshot_id: snapshotId });
    const candidate = path.resolve(rootReal, roots[parsed.layer], parsed.relativePath);
    if (!candidate.startsWith(`${rootReal}${path.sep}`) && candidate !== rootReal) throw new VikingError(ERROR_CODES.PATH_TRAVERSAL_REJECTED, 'Resolved path escapes snapshot');
    if (!fs.existsSync(candidate)) throw new VikingError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Resource not found');
    const resolvedCandidate = fs.realpathSync(candidate);
    if (!resolvedCandidate.startsWith(`${rootReal}${path.sep}`) && resolvedCandidate !== rootReal) throw new VikingError(ERROR_CODES.PATH_TRAVERSAL_REJECTED, 'Resolved path escapes snapshot');
    if (fs.statSync(resolvedCandidate).isFile()) {
      const manifestPath = path.relative(rootReal, resolvedCandidate).replaceAll('\\', '/');
      if (!manifestEntries.has(manifestPath)) throw new VikingError(ERROR_CODES.MANIFEST_INVALID, 'Resource is not listed in snapshot manifest', { snapshot_id: snapshotId });
    }
    return { parsed, candidate: resolvedCandidate };
  }
  function getTierRecord(uri, tier) {
    return typeof tierIndex.get === 'function' ? tierIndex.get(snapshotId, uri, tier) : tierIndex[`${uri}:${tier}`];
  }

  function readFile(input, tier = 'L1') {
    const { parsed, candidate } = resolve(input);
    if (!['L0', 'L1', 'L2'].includes(tier)) throw new VikingError(ERROR_CODES.INVALID_URI, 'Unknown resolution tier');
    const key = `${parsed.uri}:${tier}`;
    const record = getTierRecord(parsed.uri, tier);
    if (tier !== 'L2' && !record) throw new VikingError(ERROR_CODES.TIER_UNAVAILABLE, 'Generated tier is unavailable', { uri: parsed.uri, tier });
    if (record?.tier_available === false) throw new VikingError(ERROR_CODES.TIER_UNAVAILABLE, 'Generated tier is unavailable', { uri: parsed.uri, tier });
    if (record && (record.snapshot_id !== snapshotId || typeof record.source_hash !== 'string' || typeof record.tier_hash !== 'string' || typeof record.artifact !== 'string')) throw new VikingError(ERROR_CODES.INTEGRITY_FAILED, 'Tier metadata is not bound to the selected snapshot', { uri: parsed.uri, tier, snapshot_id: snapshotId });
    const file = tier === 'L2' ? candidate : path.resolve(rootReal, record.artifact);
    const sourceFile = tier === 'L2' ? candidate : path.resolve(rootReal, record.source_artifact ?? path.relative(rootReal, candidate));
    if (!file.startsWith(`${rootReal}${path.sep}`) || !fs.existsSync(file)) throw new VikingError(ERROR_CODES.TIER_UNAVAILABLE, 'Generated tier is unavailable', { uri: parsed.uri, tier });
    const stat = fs.statSync(file);
    if (stat.size > maxBytes) throw new VikingError(ERROR_CODES.RESOURCE_TOO_LARGE, 'Resource exceeds read limit', { max_bytes: maxBytes });
    const cacheKey = `${file}:${stat.mtimeMs}:${stat.size}`;
    const cached = contentCache.get(cacheKey);
    const actualHash = cached?.hash ?? sha256(file);
    if (record?.tier_hash && record.tier_hash !== actualHash) throw new VikingError(ERROR_CODES.INTEGRITY_FAILED, 'Tier hash mismatch', { uri: parsed.uri, tier });
    const sourceHash = sha256(sourceFile);
    const stale = tier === 'L2' ? false : sourceHash !== record.source_hash;
    const content = cached?.content ?? fs.readFileSync(file, 'utf8');
    contentCache.set(cacheKey, { hash: actualHash, content });
    return { uri: parsed.uri, resolution_tier: tier, snapshot_id: snapshotId, stale, cache_hit: Boolean(cached), source_hash: sourceHash, compiled_at: record?.compiled_at ?? null, freshness: record?.freshness ?? (stale ? 'stale' : 'fresh'), sha256: actualHash, content };
  }

  function stat(input) {
    const { parsed, candidate } = resolve(input);
    const info = fs.statSync(candidate);
    return { uri: parsed.uri, snapshot_id: snapshotId, size_bytes: info.size, last_modified: info.mtime.toISOString(), sha256: sha256(candidate), verification_status: 'verified', category: (getTierRecord(parsed.uri, 'L0') ?? getTierRecord(parsed.uri, 'L1'))?.category ?? null, tier_available: (getTierRecord(parsed.uri, 'L0') ?? getTierRecord(parsed.uri, 'L1'))?.tier_available ?? false, compiled_at: (getTierRecord(parsed.uri, 'L0') ?? getTierRecord(parsed.uri, 'L1'))?.compiled_at ?? null, source_path: (getTierRecord(parsed.uri, 'L0') ?? getTierRecord(parsed.uri, 'L1'))?.source_path ?? null, freshness: (getTierRecord(parsed.uri, 'L0') ?? getTierRecord(parsed.uri, 'L1'))?.freshness ?? 'unknown' };
  }

  function list(input, { offset = 0, limit = 100 } = {}) {
    const { parsed, candidate } = resolve(input);
    if (!fs.statSync(candidate).isDirectory()) throw new VikingError(ERROR_CODES.RESOURCE_NOT_FOUND, 'Directory not found');
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new VikingError(ERROR_CODES.INVALID_URI, 'Invalid list bounds');
    const entries = fs.readdirSync(candidate, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const page = entries.slice(offset, offset + limit);
    return { uri: parsed.uri, snapshot_id: snapshotId, complete: offset + page.length >= entries.length, next_offset: offset + page.length < entries.length ? offset + page.length : null, directories: page.filter((e) => e.isDirectory()).map((e) => e.name), files: page.filter((e) => e.isFile()).map((e) => ({ name: e.name, uri: `${parsed.uri}/${e.name}`, abstract: tierIndex[`${parsed.uri}/${e.name}:L0`]?.abstract ?? null, tier_status: tierIndex[`${parsed.uri}/${e.name}:L0`] ? 'available' : 'TIER_UNAVAILABLE' })) };
  }
  return Object.freeze({ parseUri: (uri) => parseUri(uri, vaultName, { allowLegacy }), list, stat, read: readFile });
}
