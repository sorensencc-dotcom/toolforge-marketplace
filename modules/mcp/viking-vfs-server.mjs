import readline from 'node:readline';
import { createResolver, VikingError } from './viking-resolver.mjs';
import { validateRequest, validateResponse } from './viking-vfs-contracts.mjs';
import { readPinnedSnapshot } from './viking-snapshot.mjs';
import { createTierIndex } from './viking-tier-index.mjs';

function requireParams(request) {
  if (!request || typeof request !== 'object' || typeof request.method !== 'string') throw new VikingError('INVALID_REQUEST', 'Request must include a method');
  const params = request.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) throw new VikingError('INVALID_REQUEST', 'params must be an object');
  if (!['initialize', 'resources/list'].includes(request.method) && typeof params.uri !== 'string') throw new VikingError('INVALID_REQUEST', 'uri is required');
  return params;
}

export function toJsonRpcResponse(id, payload) {
  if (payload?.error) return { jsonrpc: '2.0', id: id ?? null, error: payload.error };
  return { jsonrpc: '2.0', id: id ?? null, result: payload };
}

export function createServer(resolver, { telemetry = () => {} } = {}) {
  return Object.freeze({
    async handle(request) {
      const started = process.hrtime.bigint();
      try {
        const params = requireParams(request);
        if (request.method === 'initialize') return { protocolVersion: '2025-06-18', capabilities: { resources: { listChanged: false } }, serverInfo: { name: 'viking-vfs', version: '0.1.0' } };
        if (request.method === 'resources/list') { const listing = resolver.list(params.uri ?? 'viking://kb-sync/wiki', params); return { resources: listing.files.map((file) => ({ uri: file.uri, name: file.name, description: file.abstract ?? undefined, mimeType: 'text/plain' })), nextCursor: listing.next_offset === null ? undefined : String(listing.next_offset) }; }
        if (request.method === 'resources/read') { const value = resolver.read(params.uri, 'L1'); telemetry({ event: 'viking.request', method: request.method, snapshot_id: value.snapshot_id, generation_hash: value.generation_hash ?? null, tier: value.resolution_tier, latency_ms: Number(process.hrtime.bigint() - started) / 1e6, cache_hit: value.cache_hit }); return { contents: [{ uri: value.uri, mimeType: 'text/plain', text: value.content, annotations: { stale: value.stale, snapshot_id: value.snapshot_id } }] }; }
        if (request.method === 'viking/stat') return resolver.stat(params.uri);
        if (request.method === 'viking/list') return resolver.list(params.uri, params);
        if (request.method === 'viking/read') { const value = resolver.read(params.uri, params.resolution_tier ?? 'L1'); telemetry({ event: 'viking.request', method: request.method, snapshot_id: value.snapshot_id, generation_hash: value.generation_hash ?? null, tier: value.resolution_tier, latency_ms: Number(process.hrtime.bigint() - started) / 1e6, cache_hit: value.cache_hit }); return value; }
        throw new VikingError('METHOD_NOT_FOUND', `Unsupported method: ${request.method}`);
      } catch (error) {
        const code = error instanceof VikingError ? error.code : 'INTERNAL_ERROR';
        telemetry({ event: 'viking.error', method: request?.method ?? null, error_code: code, latency_ms: Number(process.hrtime.bigint() - started) / 1e6 });
        return { error: { code, message: error.message, data: error instanceof VikingError ? error.data : {} } };
      }
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const vaultRoot = process.env.VIKING_VAULT_ROOT;
  const vaultName = process.env.VIKING_VAULT_NAME ?? 'kb-sync';
  const pinned = process.env.VIKING_SNAPSHOT_ID ? null : readPinnedSnapshot({ vaultRoot });
  const snapshotId = process.env.VIKING_SNAPSHOT_ID ?? pinned.snapshotId;
  const tierIndexPath = process.env.VIKING_TIER_INDEX ?? (pinned ? `${pinned.snapshotRoot}/tier-index.sqlite` : null);
  const tierIndex = tierIndexPath ? createTierIndex({ filename: tierIndexPath, readonly: true }) : {};
  const resolver = createResolver({ vaultRoot, vaultName, snapshotId, snapshotRoot: pinned?.snapshotRoot, snapshotManifest: pinned?.manifest, tierIndex, layerRoots: { sources: 'sources', wiki: 'wiki', schema: 'schema' } });
  const server = createServer(resolver);
  const input = readline.createInterface({ input: process.stdin });
  input.on('line', async (line) => {
    const request = JSON.parse(line);
    const result = await server.handle(request);
    const response = toJsonRpcResponse(request.id, result);
    validateResponse(response, { method: request.method });
    process.stdout.write(`${JSON.stringify(response)}
`);
  });
}
