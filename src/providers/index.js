/**
 * Provider Factory & Dependency Injection
 * Returns configured provider instance based on environment
 */

import OllamaProvider from './ollama-provider.js';

let cachedProvider = null;

export function getProvider(config) {
  if (cachedProvider) return cachedProvider;

  cachedProvider = new OllamaProvider(config);
  return cachedProvider;
}

export function resetProvider() {
  cachedProvider = null;
}

export { OllamaProvider };
export default getProvider;
