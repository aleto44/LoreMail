/**
 * ModelClient — wrapper around the GitHub Models inference API (OpenAI-compatible endpoint).
 * Base URL: https://models.github.ai/inference
 *
 * Authentication: GitHub PAT with models:read permission, used as a Bearer token.
 * No Copilot subscription required — available to all GitHub users (free-tier rate limits apply).
 *
 * Model IDs use provider/model-name format, e.g. "openai/gpt-4.1", "meta/llama-3.3-70b-instruct".
 *
 * Handles retries on transient errors and JSON parse failures.
 */
export class ModelClient {
  constructor({ model, apiToken, baseUrl, defaultTemperature = 0.4, defaultMaxTokens = 1500 }) {
    this.model = model ?? 'openai/gpt-4.1';
    this.apiToken = apiToken;
    this.baseUrl = baseUrl ?? 'https://models.github.ai/inference';
    this.defaultTemperature = defaultTemperature;
    this.defaultMaxTokens = defaultMaxTokens;
  }

  /** Send chat request, returns raw string */
  async chat(messages, opts = {}) {
    const temperature = opts.temperature ?? this.defaultTemperature;
    const maxTokens = opts.maxTokens ?? this.defaultMaxTokens;
    return await this._requestWithRetry({ model: this.model, messages, temperature, max_tokens: maxTokens }, 3);
  }

  /**
   * Send chat request, parse and return JSON.
   * Retries once with a correction message if JSON parse fails.
   */
  async chatJson(messages, opts = {}) {
    const raw = await this.chat(messages, opts);
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch?.[0] ?? raw);
    } catch {
      // Retry with format correction appended
      const correctionMessages = [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: 'Your previous response could not be parsed as JSON.\nRespond with raw JSON only. No markdown fences. No preamble.',
        },
      ];
      const retry = await this.chat(correctionMessages, opts);
      const retryMatch = retry.match(/\{[\s\S]*\}/);
      return JSON.parse(retryMatch?.[0] ?? retry);
    }
  }

  async _requestWithRetry(body, maxRetries) {
    let lastError;
    const delays = [2000, 4000, 8000];
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiToken}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          // Never retry on auth errors
          if (response.status === 401 || response.status === 403) {
            throw new Error(`Auth error ${response.status}: ${errorText}`);
          }
          // Don't retry on bad request either
          if (response.status === 400) {
            throw new Error(`Bad request ${response.status}: ${errorText}`);
          }
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content ?? '';
      } catch (error) {
        lastError = error;
        // Don't retry on auth or bad request
        if (error.message?.startsWith('Auth error') || error.message?.startsWith('Bad request')) {
          throw error;
        }
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt] ?? 8000));
        }
      }
    }
    throw lastError;
  }
}