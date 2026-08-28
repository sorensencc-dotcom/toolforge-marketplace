import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('CI governance workflow runs on pushes and pull requests', () => {
  const workflow = read('.github/workflows/governance.yml');

  assert.match(workflow, /^ {2}push:\s*$/m);
  assert.match(workflow, /^ {2}pull_request:\s*$/m);
  assert.match(workflow, /skill-doc-validator\.ps1 -Path \.\/skills -Recursive/);
  assert.match(workflow, /\/\.context\/retros\/validate(-changed)?\.ps1/);
});

test('governance documentation identifies CI as authoritative', () => {
  const agents = read('AGENTS.md');

  assert.match(agents, /Local pre-commit hook \(`\.git\/hooks\/pre-commit\.ps1`, Gate 2\) blocks violations/);
  assert.match(agents, /CI governance check: validates line limits \+ detects duplicate sections/);
});

test('hook installer derives runtime paths from checkout', () => {
  const installer = read('setup-git-hooks.ps1');

  assert.match(installer, /\[string\]\$Repo = \(Get-Location\)\.Path/);
  assert.match(installer, /Join-Path \(git rev-parse --show-toplevel\) 'ci-pipeline\.ps1'/);
  assert.doesNotMatch(installer, /`\$ciScript = 'C:\\dev\\ci-pipeline\.ps1'/);
});

test('skill validator avoids PowerShell Error automatic-variable collision', () => {
  const validator = read('utilities/skill-doc-validator.ps1');

  assert.match(validator, /foreach \(\$finding in \$errors\)/);
  assert.doesNotMatch(validator, /foreach \(\$error in \$errors\)/);
});

test('retro schema JSON defines canonical v1.0 required fields', () => {
  const rawSchema = read('.context/retros/retro.schema.json');
  const schema = JSON.parse(rawSchema);

  assert.equal(schema.title, 'Canonical Retro Schema v1.0');
  assert.deepEqual(schema.required, [
    'date',
    'window',
    'since',
    'until',
    'base_branch',
    'metrics',
    'authors',
    'session_focus'
  ]);
  assert.ok(schema.properties.metrics.required.includes('commits'));
  assert.ok(schema.properties.metrics.required.includes('automation_commits'));
  assert.ok(schema.properties.metrics.required.includes('sessions'));
  assert.ok(schema.properties.metrics.required.includes('insertions_raw'));
  assert.ok(schema.properties.metrics.required.includes('insertions_filtered'));
});
