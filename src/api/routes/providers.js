// Providers route. Mounted at /api/v1/providers.
import express from 'express';
import { getProvider } from '../../providers/index.js';
import { runAdversarialCrossAudit } from '../../../modules/healing/adversarial-auditor.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';

const MAX_CONCURRENT_CALLS = 5;
const MAX_PROMPT_LENGTH = 32_000;

export function createProvidersRouter(customProvider, { limiter } = {}) {
  const router = express.Router();
  let inFlight = 0;

  const providerLimiter = limiter || rateLimit({ windowMs: 60_000, max: 30 });

  // Concurrency guard
  const concurrencyGuard = (req, res, next) => {
    if (inFlight >= MAX_CONCURRENT_CALLS) {
      return res.status(503).json({
        error: 'Provider capacity saturated',
        message: 'Too many concurrent provider operations. Please retry shortly.',
      });
    }
    inFlight += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlight = Math.max(0, inFlight - 1);
      }
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };

  // Attach provider instance to request context
  router.use((req, res, next) => {
    try {
      req.provider = customProvider || getProvider();
      next();
    } catch (err) {
      res.status(503).json({
        error: 'Provider unavailable',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // GET /health - Unauthenticated health check (does NOT disclose internal URLs or endpoints)
  router.get('/health', (_req, res) => {
    try {
      res.json({
        status: 'healthy',
        provider: 'OllamaProvider',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /generate - Text completion endpoint (authenticated, rate-limited, concurrency-guarded)
  router.post('/generate', requireAuth, providerLimiter, concurrencyGuard, async (req, res) => {
    try {
      const { model, prompt } = req.body || {};
      if (!model || typeof model !== 'string') {
        return res.status(400).json({ error: 'model is required and must be a string' });
      }
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'prompt is required and must be a string' });
      }
      if (prompt.length > MAX_PROMPT_LENGTH) {
        return res.status(413).json({
          error: 'Prompt exceeds maximum allowed size',
          max_allowed_chars: MAX_PROMPT_LENGTH,
          received_chars: prompt.length,
        });
      }

      const result = await req.provider.generate(model, prompt);

      // Do NOT echo submitted prompt back in response for privacy and compliance
      res.json({
        success: true,
        model,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('timed out')) {
        return res.status(504).json({ error: 'Request timeout', message });
      }
      if (message.includes('Failed to connect') || message.includes('fetch failed')) {
        return res.status(503).json({ error: 'Ollama unavailable', message });
      }
      res.status(500).json({ error: 'Generation failed', message });
    }
  });

  // POST /audit - Adversarial code cross-audit (authenticated, rate-limited, concurrency-guarded)
  router.post('/audit', requireAuth, providerLimiter, concurrencyGuard, async (req, res) => {
    try {
      const auditPacket = req.body;
      if (
        !auditPacket ||
        !auditPacket.packetId ||
        !auditPacket.specGoal ||
        !auditPacket.declaredScope ||
        !auditPacket.testOutput ||
        !auditPacket.appliedDiff ||
        !auditPacket.historyLog
      ) {
        return res.status(400).json({
          error: 'Invalid audit packet',
          required: [
            'packetId',
            'specGoal',
            'declaredScope',
            'testOutput',
            'appliedDiff',
            'historyLog',
          ],
        });
      }

      const verdict = await runAdversarialCrossAudit(auditPacket, req.provider);
      res.json({
        success: true,
        packetId: auditPacket.packetId,
        verdict,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('timed out')) {
        return res.status(504).json({ error: 'Audit timeout', message });
      }
      if (message.includes('Failed to connect') || message.includes('fetch failed')) {
        return res.status(503).json({ error: 'Provider unavailable', message });
      }
      res.status(500).json({ error: 'Audit failed', message });
    }
  });

  // GET /models - List installed models from Ollama (authenticated)
  router.get('/models', requireAuth, async (_req, res) => {
    try {
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434/v1';
      const tagsUrl = baseUrl.replace(/\/v1\/?$/, '/api/tags');
      const response = await fetch(tagsUrl);
      if (!response.ok) {
        return res.status(503).json({
          error: 'Failed to list models from Ollama',
          status: response.status,
        });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(503).json({
        error: 'Provider unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}

export default createProvidersRouter;
