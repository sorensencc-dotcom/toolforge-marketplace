// Ratings routes. Mounted at /api/v1/skills.
//   POST /:id/ratings  -> 201 | 400 | 401 | 409   (create)
//   PUT  /:id/ratings  -> 200 | 400 | 401 | 404    (edit / upsert)
//   GET  /:id/ratings  -> 200 {data: Rating[]}

import express from 'express';
import { submitRating } from '../../services/ratings.js';
import { getRatings, getSkill } from '../../db/schema.js';
import { toRating } from '../serializers.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

export function createRatingsRouter(db, { limiter } = {}) {
  const router = express.Router();
  const writeLimit = limiter || rateLimit({ windowMs: 60_000, max: 10 });

  // Create a rating.
  router.post('/:id/ratings', requireAuth, writeLimit, async (req, res) => {
    try {
      const { score, reviewText, review_text } = req.body || {};
      const { rating } = await submitRating(
        db,
        { skillId: req.params.id, userId: req.userId, score, reviewText: reviewText ?? review_text },
        { mode: 'create' }
      );
      res.status(201).json({ data: toRating(rating) });
    } catch (error) {
      if (error.name === 'RatingError') {
        return res.status(error.status || 400).json({ error: error.message });
      }
      console.error('POST /skills/:id/ratings error:', error.message);
      res.status(500).json({ error: 'Failed to create rating' });
    }
  });

  // Edit own rating (idempotent upsert).
  router.put('/:id/ratings', requireAuth, writeLimit, async (req, res) => {
    try {
      const skill = await getSkill(db, req.params.id);
      if (!skill) {
        return res.status(404).json({ error: 'Skill not found' });
      }
      const { score, reviewText, review_text } = req.body || {};
      const { rating } = await submitRating(
        db,
        { skillId: req.params.id, userId: req.userId, score, reviewText: reviewText ?? review_text },
        { mode: 'edit' }
      );
      res.status(200).json({ data: toRating(rating) });
    } catch (error) {
      if (error.name === 'RatingError') {
        return res.status(error.status || 400).json({ error: error.message });
      }
      console.error('PUT /skills/:id/ratings error:', error.message);
      res.status(500).json({ error: 'Failed to update rating' });
    }
  });

  // List ratings for a skill.
  router.get('/:id/ratings', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;
      const ratings = await getRatings(db, req.params.id, { limit, offset });
      res.json({ data: ratings.map(toRating) });
    } catch (error) {
      console.error('GET /skills/:id/ratings error:', error.message);
      res.status(500).json({ error: 'Failed to fetch ratings' });
    }
  });

  return router;
}
