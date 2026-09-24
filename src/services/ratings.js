// Phase 9 Ratings Service
// Write-boundary for ratings. Enforces server-side validation and maps the
// UNIQUE(skill_id,user_id) constraint to HTTP-shaped outcomes.

import { createRating, updateRating } from '../db/schema.js';

export const REVIEW_TEXT_MAX = 5000;

/**
 * Error with an HTTP status hint for the route layer.
 */
export class RatingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RatingError';
    this.status = status;
  }
}

function validate({ skillId, userId, score, reviewText }) {
  if (!skillId) throw new RatingError('skillId is required', 400);
  // user_id comes from the auth session, never the body; missing => unauthenticated.
  if (!userId) throw new RatingError('authenticated user is required', 401);

  const n = Number(score);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new RatingError('score must be an integer between 1 and 5', 400);
  }

  let text = reviewText;
  if (text != null) {
    if (typeof text !== 'string') {
      throw new RatingError('reviewText must be a string', 400);
    }
    if (text.length > REVIEW_TEXT_MAX) {
      throw new RatingError(`reviewText exceeds ${REVIEW_TEXT_MAX} characters`, 400);
    }
    text = text.trim();
  }
  return { skillId, userId, score: n, reviewText: text ?? null };
}

/**
 * Submit a rating.
 * @param {{query: Function}} db
 * @param {{skillId:string, userId:string, score:number, reviewText?:string}} input
 * @param {{mode:'create'|'edit'}} opts
 * @returns {Promise<{rating:Object, created:boolean}>}
 * @throws {RatingError} .status carries the HTTP code (400/401/409/500)
 */
export async function submitRating(db, input, { mode } = {}) {
  const clean = validate(input);

  if (mode !== 'create' && mode !== 'edit') {
    throw new RatingError("mode must be 'create' or 'edit'", 400);
  }

  try {
    if (mode === 'create') {
      const rating = await createRating(db, clean);
      if (!rating) {
        // ON CONFLICT DO NOTHING returned no row => already rated.
        throw new RatingError('already rated; use PUT to edit', 409);
      }
      return { rating, created: true };
    }

    // edit: idempotent upsert
    const rating = await updateRating(db, clean);
    return { rating, created: false };
  } catch (error) {
    if (error instanceof RatingError) throw error;
    throw new RatingError(`Failed to submit rating: ${error.message}`, 500);
  }
}
