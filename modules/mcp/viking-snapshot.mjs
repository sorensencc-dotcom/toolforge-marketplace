import fs from 'node:fs';
import path from 'node:path';
import { VikingError, ERROR_CODES } from './viking-resolver.mjs';

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new VikingError(ERROR_CODES.SNAPSHOT_UNAVAILABLE, 'Snapshot metadata is unreadable'); } }
function atomicWriteJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fd = fs.openSync(temp, 'w');
  try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}

export function publishGenerationPointer({ vaultRoot, generationId, sha256 }) {
  if (typeof generationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(generationId)) throw new TypeError('generationId is invalid');
  if (typeof sha256 !== 'string' || !sha256) throw new TypeError('sha256 is required');
  const pack = path.join(vaultRoot, '.nlm_pack');
  const generationRoot = path.join(pack, 'generations', generationId);
  const manifest = readJson(path.join(generationRoot, 'manifest.json'));
  if (manifest.generation_id !== generationId || manifest.sha256 !== sha256) throw new VikingError(ERROR_CODES.INTEGRITY_FAILED, 'Generation manifest does not match publication pointer');
  fs.mkdirSync(pack, { recursive: true });
  const pointer = path.join(pack, 'current_generation.json');
  if (fs.existsSync(pointer)) fs.copyFileSync(pointer, `${pointer}.previous`);
  atomicWriteJson(pointer, { active_generation: generationId, sha256 });
  return readPinnedSnapshot({ vaultRoot });
}

export function recoverCurrentGeneration({ vaultRoot }) {
  const pointer = path.join(vaultRoot, '.nlm_pack', 'current_generation.json');
  const previous = `${pointer}.previous`;
  if (!fs.existsSync(previous)) throw new VikingError(ERROR_CODES.SNAPSHOT_UNAVAILABLE, 'No recoverable generation pointer');
  fs.copyFileSync(previous, `${pointer}.recovery.tmp`);
  fs.renameSync(`${pointer}.recovery.tmp`, pointer);
  return readPinnedSnapshot({ vaultRoot });
}

export function collectGenerations({ vaultRoot, keep = 2 }) {
  if (!Number.isInteger(keep) || keep < 1) throw new TypeError('keep must be a positive integer');
  const pack = path.join(vaultRoot, '.nlm_pack');
  const active = readPinnedSnapshot({ vaultRoot }).snapshotId;
  const dir = path.join(pack, 'generations');
  const generations = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort().reverse() : [];
  const retained = new Set([active, ...generations.slice(0, keep - 1)]);
  const removed = generations.filter((id) => !retained.has(id));
  for (const id of removed) fs.rmSync(path.join(dir, id), { recursive: true, force: true });
  return { retained: [...retained], removed };
}

export function readPinnedSnapshot({ vaultRoot, pointerPath = path.join(vaultRoot, '.nlm_pack', 'current_generation.json') }) {
  const pointer = readJson(pointerPath);
  const generationId = pointer.active_generation;
  if (typeof generationId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(generationId)) throw new VikingError(ERROR_CODES.SNAPSHOT_UNAVAILABLE, 'Pointer generation ID is invalid');
  const generationRoot = path.resolve(path.dirname(pointerPath), 'generations', generationId);
  const rootReal = fs.existsSync(generationRoot) ? fs.realpathSync(generationRoot) : null;
  if (!rootReal) throw new VikingError(ERROR_CODES.SNAPSHOT_UNAVAILABLE, 'Referenced generation is unavailable', { snapshot_id: generationId });
  const manifest = readJson(path.join(rootReal, 'manifest.json'));
  if (manifest.generation_id !== generationId || manifest.sha256 !== pointer.sha256) throw new VikingError(ERROR_CODES.INTEGRITY_FAILED, 'Pointer and generation manifest disagree', { snapshot_id: generationId });
  const filesManifest = path.join(rootReal, 'FILES.manifest.txt');
  if (!fs.existsSync(filesManifest) && !Array.isArray(manifest.files)) throw new VikingError(ERROR_CODES.MANIFEST_INVALID, 'Generation has no authoritative file manifest', { snapshot_id: generationId });
  return Object.freeze({ snapshotId: generationId, snapshotRoot: rootReal, contentHash: manifest.sha256, manifest });
}