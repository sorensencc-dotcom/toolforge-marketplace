/**
 * OllamaProvider — implements LocalProviderLike interface
 * Connects to Ollama API at OLLAMA_BASE_URL
 * Defaults to http://host.docker.internal:11434/v1 for local Docker development
 */

export interface LocalProviderLike {
  generate(modelName: string, prompt: string): Promise<string>;
}

export class OllamaProvider implements LocalProviderLike {
  private baseUrl: string;
  private timeout: number;

  /**
   * @param {Object} config
   * @param {string} [config.baseUrl] - Ollama API base URL. Defaults to OLLAMA_BASE_URL env var or http://host.docker.internal:11434/v1
   * @param {number} [config.timeout] - Request timeout in milliseconds (default: 30000)
   */
  constructor(config: { baseUrl?: string; timeout?: number } = {}) {
    this.baseUrl =
      config.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      "http://host.docker.internal:11434/v1";
    this.timeout =
      config.timeout ||
      (process.env.OLLAMA_TIMEOUT
        ? parseInt(process.env.OLLAMA_TIMEOUT, 10)
        : 30000);
  }

  /**
   * Generate text using Ollama completion API
   * @param {string} modelName - Model identifier (e.g., 'llama2', 'neural-chat')
   * @param {string} prompt - The prompt/message to send
   * @returns {Promise<string>} Generated completion text
   */
  async generate(modelName: string, prompt: string): Promise<string> {
    if (!modelName || typeof modelName !== "string") {
      throw new Error("modelName must be a non-empty string");
    }
    if (!prompt || typeof prompt !== "string") {
      throw new Error("prompt must be a non-empty string");
    }

    const endpoint = `${this.baseUrl}/chat/completions`;
    const payload = {
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Ollama API returned HTTP ${response.status}: ${errorBody}`,
        );
      }

      const data = await response.json();

      // OpenAI-compatible response format
      if (
        !data.choices ||
        !Array.isArray(data.choices) ||
        data.choices.length === 0
      ) {
        throw new Error(
          "Malformed Ollama response: missing or empty choices array",
        );
      }

      const message = data.choices[0].message;
      if (!message || typeof message.content !== "string") {
        throw new Error("Malformed Ollama response: invalid message structure");
      }

      return message.content;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes("fetch")) {
        throw new Error(
          `Failed to connect to Ollama at ${this.baseUrl}: ${err.message}`,
        );
      }
      if (err instanceof SyntaxError) {
        throw new Error(`Failed to parse Ollama response: ${err.message}`);
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Ollama request timed out after ${this.timeout}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default OllamaProvider;
