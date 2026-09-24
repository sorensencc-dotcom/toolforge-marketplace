/**
 * Example usage patterns for OllamaProvider with dependency injection
 * Use the getProvider() factory throughout your application
 */

// In any module that needs the provider:
import { getProvider, resetProvider } from "../providers/index.js";
import { runAdversarialCrossAudit } from "../modules/healing/adversarial-auditor.js";

// Example 1: Using the provider in adversarial auditing flow
export async function auditWithOllama(auditPacket: any) {
  const provider = getProvider();
  const verdict = await runAdversarialCrossAudit(auditPacket, provider);
  return verdict;
}

// Example 2: Direct provider usage in a service
export async function generateWithModel(modelName: string, prompt: string) {
  const provider = getProvider();
  const result = await provider.generate(modelName, prompt);
  return result;
}

// Example 3: In Express middleware/route
import express from "express";

export function setupProviderRoutes(app: express.Express) {
  app.post("/api/generate", async (req, res) => {
    try {
      const { model, prompt } = req.body;
      const provider = getProvider();
      const result = await provider.generate(model, prompt);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/health", async (req, res) => {
    try {
      const provider = getProvider();
      // Verify by attempting a lightweight check
      res.json({ status: "healthy", provider: "OllamaProvider" });
    } catch (error) {
      res.status(503).json({
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}

// Example 4: Initialization at application startup
export async function initializeApplication() {
  // Initialize provider with explicit config (optional)
  const provider = getProvider({
    baseUrl: process.env.OLLAMA_BASE_URL,
    timeout: parseInt(process.env.OLLAMA_TIMEOUT || "30000", 10),
  });

  console.log("Provider initialized:", {
    baseUrl:
      process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434/v1",
    timeout: process.env.OLLAMA_TIMEOUT || "30000ms",
  });

  return provider;
}

// Example 5: Testing/resetting provider state
export function resetProviderForTests() {
  resetProvider();
  // Now getProvider() will create a fresh instance
}

export default {
  auditWithOllama,
  generateWithModel,
  setupProviderRoutes,
  initializeApplication,
};
