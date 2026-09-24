/**
 * Provider Factory & Dependency Injection
 * Returns configured provider instance based on environment
 */

import OllamaProvider, { type LocalProviderLike } from "./ollama-provider.js";

let cachedProvider: LocalProviderLike | null = null;

/**
 * Get or create the provider instance
 * @param {Object} [config] - Optional override config
 * @returns {LocalProviderLike} Provider instance
 */
export function getProvider(config?: {
  baseUrl?: string;
  timeout?: number;
}): LocalProviderLike {
  if (cachedProvider) return cachedProvider;

  cachedProvider = new OllamaProvider(config);
  return cachedProvider;
}

/**
 * Reset the cached provider (useful for testing)
 */
export function resetProvider(): void {
  cachedProvider = null;
}

export { OllamaProvider };
export type { LocalProviderLike };

export default getProvider;
