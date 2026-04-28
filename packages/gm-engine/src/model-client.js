/**
 * ModelClient — wrapper around the Copilot API (OpenAI-compatible endpoint).
 * Handles retries on transient errors.
 */
export class ModelClient {
  constructor({ model, apiToken, baseUrl, temperature = 0.4 }) {
    this.model = model ?? 'gpt-4o';
    this.apiToken = apiToken;
    this.baseUrl = baseUrl ?? 'https://models.inference.ai.azure.com';
    this.defaultTemperature = temperature;
  }

  /**
   * Send a chat completion request.
   * @param {Array} messages - OpenAI-compatible messages array
   * @param {object} opts - { temperature, maxTokens }
   * @returns {Promise<string>} - assistant message content
   */
  async chat(messages, opts = {}) {
    const temperature = opts.temperature ?? this.defaultTemperature;
    const maxTokens = opts.maxTokens ?? 2048;

    const body = {
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    return await this._requestWithRetry(body, 3);
  }

  async _requestWithRetry(body, maxRetries) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Don't retry on auth errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Auth error ${response.status}: ${errorText}`);
          }
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? '';
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }
}
