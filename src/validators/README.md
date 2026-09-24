# Phase 9 Validators

Manifest and SemVer constraint validators for marketplace operations.

## Manifest Validator

Validates skill manifest.json against Phase 8 conformance schema.

**Required Fields:**
- `name` — lowercase alphanumeric + hyphens
- `version` — SemVer (e.g., 1.2.0)
- `category` — one of: linting, auth, analytics, deployment, testing, devtools, security, other
- `description` — 10-500 characters
- `owner` — valid email address
- `entrypoint` — file path with valid extension (.js, .sh, .py, .go, .rs)
- `runtime` — one of: bash, node, python, go, rust

**Optional Fields:**
- `status` — draft, published, deprecated (defaults to draft)
- `metadata` — arbitrary object

**Usage:**
```javascript
import { validateManifest } from './src/validators/manifest.js';

const manifest = {
  name: 'my-skill',
  version: '1.0.0',
  category: 'linting',
  description: 'A linting skill for code analysis',
  owner: 'user@example.com',
  entrypoint: 'src/index.js',
  runtime: 'node',
};

const result = validateManifest(manifest);
// { valid: true, manifest: { ... } }
```

**Error Handling:**
```javascript
import { validateManifest, ManifestError } from './src/validators/manifest.js';

try {
  validateManifest(invalidManifest);
} catch (error) {
  if (error instanceof ManifestError) {
    console.log('Validation errors:', error.message);
  }
}
```

---

## SemVer Resolver

Resolves version constraints against available versions.

**Supported Constraints:**
- `^1.2.0` — caret: >=1.2.0 <2.0.0 (minor/patch changes ok)
- `~1.2.0` — tilde: >=1.2.0 <1.3.0 (patch changes ok)
- `1.2.0` — exact match
- `>=1.2.0`, `>1.2.0` — greater than or equal
- `<=1.2.0`, `<1.2.0` — less than or equal
- `1.2.*` — any patch version of 1.2.x

**Usage:**
```javascript
import { resolvePin } from './src/validators/semver.js';

const available = ['1.0.0', '1.1.0', '1.2.0', '1.2.3', '2.0.0'];
const resolved = resolvePin('^1.2.0', available);
console.log(resolved); // '1.2.3' (highest matching)
```

**Version Comparison:**
```javascript
import { compareVersions } from './src/validators/semver.js';

compareVersions('1.2.0', '1.2.3'); // -1 (first < second)
compareVersions('2.0.0', '1.0.0'); // 1 (first > second)
compareVersions('1.0.0', '1.0.0'); // 0 (equal)
```

---

## Testing

```bash
npm test src/validators/
```

Manifest validator tests: 9 scenarios
SemVer resolver tests: 13 scenarios

All validators are sync; no database required for testing.
