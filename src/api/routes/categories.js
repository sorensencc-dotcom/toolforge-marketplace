// Categories route. Mounted at /api/v1/categories.
//   GET / -> 200 {data: Category[]}

import express from 'express';
import { listCategories } from '../../db/schema.js';
import { toCategory } from '../serializers.js';

export function createCategoriesRouter(db) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const categories = await listCategories(db);
      res.json({ data: categories.map(toCategory) });
    } catch (error) {
      console.error('GET /categories error:', error.message);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  });

  return router;
}
