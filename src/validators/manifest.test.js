import test from 'node:test';
import assert from 'node:assert';
import { validateManifest, ManifestError } from './manifest.js';

test('Manifest Validator', async (t) => {
  await t.test('accept valid manifest', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
      category: 'linting',
      description: 'A linting skill for code analysis',
      owner: 'user@example.com',
      entrypoint: 'src/index.js',
      runtime: 'node',
      status: 'published',
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.manifest.name, 'my-skill');
  });

  await t.test('reject missing required fields', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('reject invalid name', () => {
    const manifest = {
      name: 'My-Skill', // uppercase not allowed
      version: '1.0.0',
      category: 'linting',
      description: 'A skill for linting',
      owner: 'user@example.com',
      entrypoint: 'index.js',
      runtime: 'node',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('reject invalid version', () => {
    const manifest = {
      name: 'my-skill',
      version: 'v1.0.0', // v prefix not allowed
      category: 'linting',
      description: 'A skill for linting',
      owner: 'user@example.com',
      entrypoint: 'index.js',
      runtime: 'node',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('reject invalid category', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
      category: 'invalid-category',
      description: 'A skill for linting',
      owner: 'user@example.com',
      entrypoint: 'index.js',
      runtime: 'node',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('reject short description', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
      category: 'linting',
      description: 'Short', // less than 10 chars
      owner: 'user@example.com',
      entrypoint: 'index.js',
      runtime: 'node',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('reject invalid email owner', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
      category: 'linting',
      description: 'A skill for linting',
      owner: 'not-an-email',
      entrypoint: 'index.js',
      runtime: 'node',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('reject invalid runtime', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
      category: 'linting',
      description: 'A skill for linting',
      owner: 'user@example.com',
      entrypoint: 'index.js',
      runtime: 'invalid-runtime',
    };
    assert.throws(
      () => validateManifest(manifest),
      ManifestError
    );
  });

  await t.test('default status to draft', () => {
    const manifest = {
      name: 'my-skill',
      version: '1.0.0',
      category: 'linting',
      description: 'A skill for linting',
      owner: 'user@example.com',
      entrypoint: 'index.js',
      runtime: 'node',
    };
    const result = validateManifest(manifest);
    assert.strictEqual(result.manifest.status, 'draft');
  });
});
