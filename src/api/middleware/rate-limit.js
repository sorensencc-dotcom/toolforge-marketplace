// In-memory fixed-window rate limiter (per user).
// Blunts ratings spam / review-bombing. No Redis (per stack constraints); this
// is a single-process limiter. Behind multiple instances, move to a shared
// store — the interface stays the same.

/**
 * @param {{windowMs?:number, max?:number, keyFn?:(req)=>string}} [opts]
 */
export function rateLimit({ windowMs = 60_000, max = 10, keyFn } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  const getKey = keyFn || ((req) => req.userId || req.ip || 'anonymous');

  return (req, res, next) => {
    const key = getKey(req);
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests' });
    }
    next();
  };
}
