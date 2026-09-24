/**
 * Example: API Server Integration with OllamaProvider
 *
 * Add this to your existing api/server.ts or similar to enable
 * provider-backed endpoints and middleware.
 */

import express, { Express, Request, Response, NextFunction } from "express";
import { getProvider } from "../src/providers/index.js";
import { runAdversarialCrossAudit } from "../modules/healing/adversarial-auditor.js";

declare global {
  namespace Express {
    interface Request {
      provider?: any;
    }
  }
}

/**
 * Middleware: Attach provider to request context
 */
export function providerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    req.provider = getProvider();
    next();
  } catch (error) {
    res.status(503).json({
      error: "Provider unavailable",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Setup provider-backed routes
 */
export function setupProviderRoutes(app: Express): void {
  // Attach provider middleware to all routes
  app.use(providerMiddleware);

  // Health check
  app.get("/health/provider", (req: Request, res: Response) => {
    try {
      const provider = getProvider();
      res.json({
        status: "healthy",
        provider: "OllamaProvider",
        endpoint:
          process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Text generation endpoint
  app.post("/api/generate", async (req: Request, res: Response) => {
    try {
      const { model, prompt } = req.body;

      if (!model || typeof model !== "string") {
        return res
          .status(400)
          .json({ error: "model is required and must be a string" });
      }

      if (!prompt || typeof prompt !== "string") {
        return res
          .status(400)
          .json({ error: "prompt is required and must be a string" });
      }

      const result = await req.provider.generate(model, prompt);

      res.json({
        success: true,
        model,
        prompt,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("timed out")) {
        return res.status(504).json({
          error: "Request timeout",
          message,
        });
      }

      if (message.includes("Failed to connect")) {
        return res.status(503).json({
          error: "Ollama unavailable",
          message,
        });
      }

      res.status(500).json({
        error: "Generation failed",
        message,
      });
    }
  });

  // Audit endpoint using adversarial auditor with provider
  app.post("/api/audit", async (req: Request, res: Response) => {
    try {
      const auditPacket = req.body;

      // Validate required fields
      if (
        !auditPacket.packetId ||
        !auditPacket.specGoal ||
        !auditPacket.declaredScope ||
        !auditPacket.testOutput ||
        !auditPacket.appliedDiff ||
        !auditPacket.historyLog
      ) {
        return res.status(400).json({
          error: "Invalid audit packet",
          required: [
            "packetId",
            "specGoal",
            "declaredScope",
            "testOutput",
            "appliedDiff",
            "historyLog",
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
      const message = error instanceof Error ? error.message : "Unknown error";

      if (message.includes("timed out")) {
        return res.status(504).json({
          error: "Audit timeout",
          message,
        });
      }

      if (message.includes("Failed to connect")) {
        return res.status(503).json({
          error: "Provider unavailable",
          message,
        });
      }

      res.status(500).json({
        error: "Audit failed",
        message,
      });
    }
  });

  // List available models (proxies to Ollama)
  app.get("/api/models", async (req: Request, res: Response) => {
    try {
      const baseUrl =
        process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1";
      const response = await fetch(baseUrl.replace("/v1", "/api/tags"));

      if (!response.ok) {
        return res.status(503).json({
          error: "Failed to list models from Ollama",
          status: response.status,
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(503).json({
        error: "Provider unavailable",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

/**
 * Export example for use in main server file:
 *
 * import express from 'express';
 * import { setupProviderRoutes } from './providers-api.js';
 *
 * const app = express();
 * app.use(express.json());
 *
 * // Setup provider endpoints
 * setupProviderRoutes(app);
 *
 * app.listen(3000, () => {
 *   console.log('Server running on port 3000');
 *   console.log('Provider endpoints ready:');
 *   console.log('  POST /api/generate');
 *   console.log('  POST /api/audit');
 *   console.log('  GET /api/models');
 *   console.log('  GET /health/provider');
 * });
 */

export default setupProviderRoutes;
