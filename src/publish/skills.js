import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { getSkillByName, insertSkill } from '../db/schema.js';

/** The category vocabulary in toolforge-marketplace-spec-v1.0 (manifest validation). */
export const SPEC_CATEGORIES = ['monitoring', 'pipeline', 'utility', 'integration', 'governance'];

/**
 * Derive the skill rows for every plugin in the catalog.
 *
 * Everything but `category` comes from the catalog: name and description from the
 * marketplace entry, owner from the marketplace owner, and manifest_json from the
 * plugin's own plugin.json (or, for a plugin hosted in another repository that has
 * no manifest at its root, from its marketplace entry). The catalog has no category,
 * so each plugin needs an explicit entry in `list.skills`.
 *
 * @param {{marketplace: object, list: {skills?: Array<{name: string, category: string}>}, readManifest: (source: string) => object}} args
 * @returns {Array<{name: string, category: string, description: string, owner: string, icon_url: null, manifest_json: object}>}
 */
export function buildSkillRows({ marketplace, list, readManifest }) {
  const entries = list.skills;
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('the list has no "skills" section');

  const byName = new Map();
  for (const [i, entry] of entries.entries()) {
    if (typeof entry?.name !== 'string' || entry.name === '') throw new Error(`skills[${i}]: name is required`);
    if (!SPEC_CATEGORIES.includes(entry.category)) {
      throw new Error(`skills[${i}] (${entry.name}): category ${JSON.stringify(entry.category)} is not one of ${SPEC_CATEGORIES.join(', ')}`);
    }
    if (byName.has(entry.name)) throw new Error(`skills[${i}]: duplicate entry for ${entry.name}`);
    byName.set(entry.name, entry);
  }

  const catalogNames = new Set(marketplace.plugins.map((p) => p.name));
  for (const name of byName.keys()) {
    if (!catalogNames.has(name)) throw new Error(`skills lists ${name}, which is not a plugin in the catalog`);
  }

  return marketplace.plugins.map((plugin) => {
    const entry = byName.get(plugin.name);
    if (!entry) throw new Error(`the catalog plugin ${plugin.name} has no entry in the list's skills section`);
    if (typeof plugin.description !== 'string' || plugin.description === '') throw new Error(`${plugin.name}: the catalog has no description`);
    if (typeof marketplace.owner?.name !== 'string' || marketplace.owner.name === '') throw new Error('the catalog has no owner name');
    return {
      name: plugin.name,
      category: entry.category,
      description: plugin.description,
      owner: marketplace.owner.name,
      icon_url: null,
      manifest_json: typeof plugin.source === 'string' ? readManifest(plugin.source) : plugin,
    };
  });
}

/** Read the catalog and the list from a repository checkout. */
export function loadSkillRows(rootDir, listFile) {
  const marketplace = JSON.parse(readFileSync(resolve(rootDir, '.claude-plugin/marketplace.json'), 'utf8'));
  const list = JSON.parse(readFileSync(listFile, 'utf8'));
  const readManifest = (source) => JSON.parse(readFileSync(resolve(rootDir, source, '.claude-plugin/plugin.json'), 'utf8'));
  return buildSkillRows({ marketplace, list, readManifest });
}

const displayName = (slug) => slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Create the skills (and the category rows the navigation reads) that are missing.
 * Never overwrites: a skill that already exists is left as it is, and any difference
 * from the catalog is reported. With `apply`, everything runs in one transaction, so
 * `db` must be a single connection, not a pool.
 *
 * @returns {Promise<Array<{name: string, status: 'created'|'dry-run'|'unchanged'|'differs', differences: string[], newCategory: boolean}>>}
 */
export async function createSkills({ db, rows, apply = false }) {
  if (apply && !db) throw new Error('--apply needs a database connection');
  const results = [];
  const knownCategories = new Set();

  if (apply) await db.query('BEGIN');
  try {
    for (const row of rows) {
      const existing = db ? await getSkillByName(db, row.name) : null;
      if (existing) {
        const differences = [];
        for (const field of ['category', 'description', 'owner']) {
          if (existing[field] !== row[field]) differences.push(`${field}: registry has ${JSON.stringify(existing[field])}, catalog has ${JSON.stringify(row[field])}`);
        }
        // Postgres jsonb does not keep key order, so compare structurally, not as text.
        if (!isDeepStrictEqual(existing.manifest_json, row.manifest_json)) differences.push('manifest_json differs');
        results.push({ name: row.name, status: differences.length ? 'differs' : 'unchanged', differences, newCategory: false });
        continue;
      }

      let newCategory = false;
      if (db && !knownCategories.has(row.category)) {
        const found = await db.query('SELECT 1 FROM categories WHERE slug = $1', [row.category]);
        newCategory = found.rows.length === 0;
        knownCategories.add(row.category);
      }

      if (apply) {
        if (newCategory) {
          await db.query('INSERT INTO categories (slug, display_name, sort_order) VALUES ($1, $2, 0) ON CONFLICT (slug) DO NOTHING', [row.category, displayName(row.category)]);
        }
        await insertSkill(db, row);
      }
      results.push({ name: row.name, status: apply ? 'created' : 'dry-run', differences: [], newCategory });
    }
    if (apply) await db.query('COMMIT');
  } catch (error) {
    if (apply) await db.query('ROLLBACK');
    throw error;
  }
  return results;
}
