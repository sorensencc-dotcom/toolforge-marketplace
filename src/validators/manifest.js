// Phase 9 Manifest Validator
// Validates skill manifest.json against Phase 8 conformance schema

export const MANIFEST_SCHEMA = {
  required: ['name', 'version', 'category', 'description', 'owner', 'entrypoint', 'runtime'],
  categories: ['linting', 'auth', 'analytics', 'deployment', 'testing', 'devtools', 'security', 'other'],
  runtimes: ['bash', 'node', 'python', 'go', 'rust'],
  statuses: ['draft', 'published', 'deprecated'],
};

export class ManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManifestError';
  }
}

export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    throw new ManifestError('Manifest must be an object');
  }

  // Check required fields
  for (const field of MANIFEST_SCHEMA.required) {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate name
  if (manifest.name && typeof manifest.name !== 'string') {
    errors.push('Field "name" must be string');
  }
  if (manifest.name && !/^[a-z0-9-]+$/.test(manifest.name)) {
    errors.push('Field "name" must be lowercase alphanumeric with hyphens');
  }

  // Validate version (SemVer)
  if (manifest.version && !isSemVer(manifest.version)) {
    errors.push(`Field "version" must be valid SemVer (got: ${manifest.version})`);
  }

  // Validate category
  if (manifest.category && !MANIFEST_SCHEMA.categories.includes(manifest.category)) {
    errors.push(
      `Field "category" must be one of: ${MANIFEST_SCHEMA.categories.join(', ')} (got: ${manifest.category})`
    );
  }

  // Validate description
  if (manifest.description) {
    if (typeof manifest.description !== 'string') {
      errors.push('Field "description" must be string');
    }
    if (manifest.description.length < 10) {
      errors.push('Field "description" must be at least 10 characters');
    }
    if (manifest.description.length > 500) {
      errors.push('Field "description" must be at most 500 characters');
    }
  }

  // Validate owner (email format)
  if (manifest.owner && typeof manifest.owner !== 'string') {
    errors.push('Field "owner" must be string (email address)');
  }
  if (manifest.owner && !isValidEmail(manifest.owner)) {
    errors.push(`Field "owner" must be valid email (got: ${manifest.owner})`);
  }

  // Validate entrypoint
  if (manifest.entrypoint && typeof manifest.entrypoint !== 'string') {
    errors.push('Field "entrypoint" must be string (file path)');
  }
  if (manifest.entrypoint && !manifest.entrypoint.match(/\.(js|sh|py|go|rs)$/)) {
    errors.push(`Field "entrypoint" must have valid extension (got: ${manifest.entrypoint})`);
  }

  // Validate runtime
  if (manifest.runtime && !MANIFEST_SCHEMA.runtimes.includes(manifest.runtime)) {
    errors.push(
      `Field "runtime" must be one of: ${MANIFEST_SCHEMA.runtimes.join(', ')} (got: ${manifest.runtime})`
    );
  }

  // Validate status (optional, defaults to draft)
  if (manifest.status && !MANIFEST_SCHEMA.statuses.includes(manifest.status)) {
    errors.push(
      `Field "status" must be one of: ${MANIFEST_SCHEMA.statuses.join(', ')} (got: ${manifest.status})`
    );
  }

  // Validate metadata (optional)
  if (manifest.metadata) {
    if (typeof manifest.metadata !== 'object') {
      errors.push('Field "metadata" must be object');
    }
  }

  if (errors.length > 0) {
    throw new ManifestError(errors.join('\n'));
  }

  return {
    valid: true,
    manifest: {
      name: manifest.name,
      version: manifest.version,
      category: manifest.category,
      description: manifest.description,
      owner: manifest.owner,
      entrypoint: manifest.entrypoint,
      runtime: manifest.runtime,
      status: manifest.status || 'draft',
      metadata: manifest.metadata || {},
    },
  };
}

function isSemVer(version) {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version);
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
