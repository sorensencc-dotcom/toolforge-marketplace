// Related-skills + version-resolve routes. Mounted at /api/v1/skills.
//   GET /:id/related             -> 200 {data: Skill[]}
//   GET /:id/resolve?constraint= -> 200 {data:{resolved}} | 400 | 404

import express from 'express';
import { getRelated } from '../../services/recommendation.js';
import { getSkill, getVersions } from '../../db/schema.js';
import { toSkillSummary } from '../serializers.js';
import { resolvePin, SemVerError } from '../../validators/semver.js';

export function createRelatedRouter(db) {
  const router = express.Router();

  router.get('/:id/related', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const skills = await getRelated(db, req.params.id, { limit });
      res.json({ data: skills.map(toSkillSummary) });
    } catch (error) {
      console.error('GET /skills/:id/related error:', error.message);
      res.status(500).json({ error: 'Failed to fetch related skills' });
    }
  });

  router.get('/:id/resolve', async (req, res) => {
    try {
      const { constraint } = req.query;
      if (!constraint) {
        return res.status(400).json({ error: 'constraint query parameter is required' });
      }

      const skill = await getSkill(db, req.params.id);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const versions = await getVersions(db, req.params.id);
      const tags = versions.map((v) => v.version_tag);

      let resolved;
      try {
        resolved = resolvePin(constraint, tags);
      } catch (err) {
        if (err instanceof SemVerError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }

      if (resolved === null) {
        return res.status(404).json({ error: 'No version satisfies the constraint' });
      }

      res.json({ data: { resolved } });
    } catch (error) {
      console.error('GET /skills/:id/resolve error:', error.message);
      res.status(500).json({ error: 'Failed to resolve version' });
    }
  });

  return router;
}
