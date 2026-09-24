import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { pool, health } from '../db/connect.js';
import * as schema from '../db/schema.js';
import { attachUser } from './middleware/auth.js';
import { createRatingsRouter } from './routes/ratings.js';
import { createCategoriesRouter } from './routes/categories.js';
import { createRelatedRouter } from './routes/related.js';
import { createProvidersRouter } from './routes/providers.js';
import { toTrendingItem } from './serializers.js';

dotenv.config();

/**
 * Build the Express app. Factory form so tests can inject a mock db without a
 * live PostgreSQL. Pass `resolveUser` to override auth in tests.
 * @param {{query: Function}} db
 * @param {{resolveUser?: Function, limiter?: Function, provider?: Object}} [opts]
 */
export function createApp(db, { resolveUser, limiter, provider } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(attachUser(resolveUser));

  // Health check
  app.get('/health', async (req, res) => {
    try {
      const result = await db.query('SELECT 1');
      const isOk = Boolean(result && result.rows && result.rows.length > 0);
      res.json({ status: isOk ? 'ok' : 'unhealthy' });
    } catch {
      res.json({ status: 'unhealthy' });
    }
  });

  // GET /api/v1/skills — List skills (paginated)
  app.get('/api/v1/skills', async (req, res) => {
    try {
      const { category, status = 'published', limit = 50, offset = 0, sort = 'created_at' } = req.query;
      const skills = await schema.listSkills(db, {
        category: category || undefined,
        status,
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
        sort,
      });
      res.json({ data: skills });
    } catch (error) {
      console.error('GET /api/v1/skills error:', error.message);
      res.status(500).json({ error: 'Failed to list skills' });
    }
  });

  // GET /api/v1/skills/search — Search skills
  app.get('/api/v1/skills/search', async (req, res) => {
    try {
      const { q, limit = 50, offset = 0 } = req.query;
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required' });
      }
      const results = await schema.searchSkills(db, q, {
        limit: Math.min(parseInt(limit) || 50, 100),
        offset: parseInt(offset) || 0,
      });
      res.json({ data: results });
    } catch (error) {
      console.error('GET /api/v1/skills/search error:', error.message);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // GET /api/v1/skills/trending — Get trending skills.
  // MUST be registered BEFORE GET /api/v1/skills/:id, otherwise the :id route
  // captures "trending" as an id and returns 404 (the prior live bug).
  app.get('/api/v1/skills/trending', async (req, res) => {
    try {
      const { window = '30d', limit = 50 } = req.query;
      const trending = await schema.getTrendingMetrics(db, {
        window: window === '7d' ? '7d' : '30d',
        limit: Math.min(parseInt(limit) || 50, 100),
      });
      res.json({ data: trending.map(toTrendingItem) });
    } catch (error) {
      console.error('GET /api/v1/skills/trending error:', error.message);
      res.status(500).json({ error: 'Failed to fetch trending' });
    }
  });

  // Two-segment /skills/:id/* routers (ratings, related, resolve). Mounted
  // before /:id so intent is explicit; they are path-depth-safe regardless.
  app.use('/api/v1/skills', createRatingsRouter(db, { limiter }));
  app.use('/api/v1/skills', createRelatedRouter(db));

  // Categories taxonomy
  app.use('/api/v1/categories', createCategoriesRouter(db));

  // Provider routes (Ollama / LocalProviderLike integration)
  const providersRouter = createProvidersRouter(provider, { limiter });
  app.use('/api/v1/providers', providersRouter);
  app.get('/health/provider', (req, res, next) => {
    req.url = '/health';
    providersRouter(req, res, next);
  });
  app.post('/api/generate', (req, res, next) => {
    req.url = '/generate';
    providersRouter(req, res, next);
  });
  app.post('/api/audit', (req, res, next) => {
    req.url = '/audit';
    providersRouter(req, res, next);
  });
  app.get('/api/models', (req, res, next) => {
    req.url = '/models';
    providersRouter(req, res, next);
  });

  // GET /api/v1/skills/:id — Get skill detail
  app.get('/api/v1/skills/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const skill = await schema.getSkill(db, id);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const ratingAvg = await schema.getRatingAverage(db, id);
      res.json({ data: { ...skill, rating: ratingAvg } });
    } catch (error) {
      console.error('GET /api/v1/skills/:id error:', error.message);
      res.status(500).json({ error: 'Failed to fetch skill' });
    }
  });

  // GET /api/v1/skills/:id/versions — Get skill versions
  app.get('/api/v1/skills/:id/versions', async (req, res) => {
    try {
      const { id } = req.params;
      const skill = await schema.getSkill(db, id);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const versions = await schema.getVersions(db, id);
      res.json({ data: versions });
    } catch (error) {
      console.error('GET /api/v1/skills/:id/versions error:', error.message);
      res.status(500).json({ error: 'Failed to fetch versions' });
    }
  });

  // 404
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Default db binding for production use.
const db = { query: (text, params) => pool.query(text, params) };

export const app = createApp(db);

// Only listen when executed directly (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Marketplace API listening on port ${PORT}`);
  });
}
