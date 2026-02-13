import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AI Provider abstraction layer.
 * Supports OpenClaw, OpenAI, Anthropic, MiniMax, Google, and custom endpoints.
 */

// Provider feature capabilities
const FEATURES = { VISION: 'vision', CHAT: 'chat', EMBEDDING: 'embedding' };

// Default provider configs
const DEFAULT_PROVIDERS = {
  openclaw: {
    endpoint: 'http://localhost:18789',
    features: [FEATURES.VISION, FEATURES.CHAT, FEATURES.EMBEDDING],
  },
  openai: {
    endpoint: 'https://api.openai.com/v1',
    visionModel: 'gpt-4o',
    chatModel: 'gpt-4o',
    embeddingModel: 'text-embedding-3-small',
    features: [FEATURES.VISION, FEATURES.CHAT, FEATURES.EMBEDDING],
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1',
    visionModel: 'claude-sonnet-4-20250514',
    chatModel: 'claude-sonnet-4-20250514',
    features: [FEATURES.VISION, FEATURES.CHAT],
  },
  minimax: {
    endpoint: 'https://api.minimax.chat/v1',
    visionModel: 'abab6.5-chat',
    chatModel: 'abab6.5-chat',
    features: [FEATURES.VISION, FEATURES.CHAT],
  },
  google: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    visionModel: 'gemini-pro-vision',
    chatModel: 'gemini-pro',
    features: [FEATURES.VISION, FEATURES.CHAT],
  },
};

class AIProvider {
  constructor(config = {}) {
    this.defaultProvider = config.defaultProvider || 'openclaw';
    this.providers = {};

    // Merge default configs with user overrides
    for (const [name, defaults] of Object.entries(DEFAULT_PROVIDERS)) {
      this.providers[name] = { ...defaults, ...(config.providers?.[name] || {}) };
    }

    // Add custom provider if configured
    if (config.providers?.custom) {
      this.providers.custom = config.providers.custom;
    }
  }

  /**
   * Load AI config from refboard.json
   */
  static fromProjectDir(projectDir) {
    const configPath = join(projectDir, 'refboard.json');
    if (!existsSync(configPath)) return new AIProvider();
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return new AIProvider(config.ai || {});
  }

  /**
   * Get a provider adapter by name
   */
  getProvider(name) {
    const providerName = name || this.defaultProvider;
    const config = this.providers[providerName];
    if (!config) throw new Error(`Unknown AI provider: ${providerName}`);

    switch (providerName) {
      case 'openclaw': return new OpenClawAdapter(config);
      case 'openai': return new OpenAIAdapter(config);
      case 'anthropic': return new AnthropicAdapter(config);
      case 'minimax': return new MiniMaxAdapter(config);
      case 'google': return new GoogleAdapter(config);
      case 'custom': return new CustomAdapter(config);
      default: return new OpenAIAdapter(config); // OpenAI-compatible fallback
    }
  }

  /**
   * Check if default provider supports a feature
   */
  supports(feature) {
    const config = this.providers[this.defaultProvider];
    return config?.features?.includes(feature) || false;
  }

  /**
   * List configured providers with their features
   */
  listProviders() {
    return Object.entries(this.providers).map(([name, config]) => ({
      name,
      endpoint: config.endpoint,
      features: config.features || [],
      isDefault: name === this.defaultProvider,
      hasApiKey: !!(config.apiKey),
    }));
  }
}

// ============ Base Adapter ============

class BaseAdapter {
  constructor(config) {
    this.config = config;
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  }

  async _fetch(url, body, headers = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  /**
   * Analyze an image and return description + tags
   */
  async analyzeImage(_imagePath, _prompt) {
    throw new Error('analyzeImage not implemented for this provider');
  }

  /**
   * Chat completion
   */
  async chat(_messages) {
    throw new Error('chat not implemented for this provider');
  }

  /**
   * Generate embedding vector
   */
  async embed(_text) {
    throw new Error('embed not implemented for this provider');
  }
}

// ============ OpenClaw Adapter ============

class OpenClawAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'http://localhost:18789';
  }

  async analyzeImage(imagePath, prompt = 'Describe this image. Return a JSON with "description" and "tags" (array of strings).') {
    const imageData = readFileSync(imagePath).toString('base64');
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    const mime = mimeMap[ext] || 'image/jpeg';

    const result = await this._fetch(`${this.endpoint}/v1/chat/completions`, {
      model: this.config.visionModel || 'default',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageData}` } },
        ],
      }],
    });
    return this._parseAnalysis(result);
  }

  async chat(messages) {
    const result = await this._fetch(`${this.endpoint}/v1/chat/completions`, {
      model: this.config.chatModel || 'default',
      messages,
    });
    return result.choices?.[0]?.message?.content || '';
  }

  async embed(text) {
    const result = await this._fetch(`${this.endpoint}/v1/embeddings`, {
      model: this.config.embeddingModel || 'default',
      input: text,
    });
    return result.data?.[0]?.embedding || [];
  }

  _parseAnalysis(result) {
    const content = result.choices?.[0]?.message?.content || '';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { description: content, tags: [] };
  }
}

// ============ OpenAI Adapter ============

class OpenAIAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
  }

  _headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async analyzeImage(imagePath, prompt = 'Describe this image. Return a JSON with "description" and "tags" (array of strings).') {
    const imageData = readFileSync(imagePath).toString('base64');
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    const mime = mimeMap[ext] || 'image/jpeg';

    const result = await this._fetch(`${this.endpoint}/chat/completions`, {
      model: this.config.visionModel || 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageData}` } },
        ],
      }],
      max_tokens: 1000,
    }, this._headers());

    return this._parseAnalysis(result);
  }

  async chat(messages) {
    const result = await this._fetch(`${this.endpoint}/chat/completions`, {
      model: this.config.chatModel || 'gpt-4o',
      messages,
    }, this._headers());
    return result.choices?.[0]?.message?.content || '';
  }

  async embed(text) {
    const result = await this._fetch(`${this.endpoint}/embeddings`, {
      model: this.config.embeddingModel || 'text-embedding-3-small',
      input: text,
    }, this._headers());
    return result.data?.[0]?.embedding || [];
  }

  _parseAnalysis(result) {
    const content = result.choices?.[0]?.message?.content || '';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { description: content, tags: [] };
  }
}

// ============ Anthropic Adapter ============

class AnthropicAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'https://api.anthropic.com/v1';
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
  }

  _headers() {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };
  }

  async analyzeImage(imagePath, prompt = 'Describe this image. Return a JSON with "description" and "tags" (array of strings).') {
    const imageData = readFileSync(imagePath).toString('base64');
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    const mime = mimeMap[ext] || 'image/jpeg';

    const result = await this._fetch(`${this.endpoint}/messages`, {
      model: this.config.visionModel || 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: imageData } },
          { type: 'text', text: prompt },
        ],
      }],
    }, this._headers());

    const content = result.content?.[0]?.text || '';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { description: content, tags: [] };
  }

  async chat(messages) {
    // Convert OpenAI-style messages to Anthropic format
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');

    const body = {
      model: this.config.chatModel || 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: nonSystem,
    };
    if (systemMsg) body.system = systemMsg.content;

    const result = await this._fetch(`${this.endpoint}/messages`, body, this._headers());
    return result.content?.[0]?.text || '';
  }
}

// ============ MiniMax Adapter ============

class MiniMaxAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'https://api.minimax.chat/v1';
    this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY;
  }

  _headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async analyzeImage(imagePath, prompt) {
    // MiniMax uses OpenAI-compatible format
    const imageData = readFileSync(imagePath).toString('base64');
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const mime = mimeMap[ext] || 'image/jpeg';

    const result = await this._fetch(`${this.endpoint}/chat/completions`, {
      model: this.config.visionModel || 'abab6.5-chat',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt || 'Describe this image. Return JSON with "description" and "tags".' },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${imageData}` } },
        ],
      }],
    }, this._headers());

    const content = result.choices?.[0]?.message?.content || '';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { description: content, tags: [] };
  }

  async chat(messages) {
    const result = await this._fetch(`${this.endpoint}/chat/completions`, {
      model: this.config.chatModel || 'abab6.5-chat',
      messages,
    }, this._headers());
    return result.choices?.[0]?.message?.content || '';
  }
}

// ============ Google Adapter ============

class GoogleAdapter extends BaseAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint || 'https://generativelanguage.googleapis.com/v1beta';
    this.apiKey = config.apiKey || process.env.GOOGLE_AI_API_KEY;
  }

  async analyzeImage(imagePath, prompt) {
    const imageData = readFileSync(imagePath).toString('base64');
    const ext = imagePath.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const mime = mimeMap[ext] || 'image/jpeg';
    const model = this.config.visionModel || 'gemini-pro-vision';

    const result = await this._fetch(
      `${this.endpoint}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        contents: [{
          parts: [
            { text: prompt || 'Describe this image. Return JSON with "description" and "tags".' },
            { inline_data: { mime_type: mime, data: imageData } },
          ],
        }],
      },
    );

    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { description: content, tags: [] };
  }

  async chat(messages) {
    const model = this.config.chatModel || 'gemini-pro';
    // Convert OpenAI-format messages to Gemini format
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const result = await this._fetch(
      `${this.endpoint}/models/${model}:generateContent?key=${this.apiKey}`,
      { contents },
    );
    return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}

// ============ Custom Adapter (OpenAI-compatible) ============

class CustomAdapter extends OpenAIAdapter {
  constructor(config) {
    super(config);
    this.endpoint = config.endpoint;
  }

  _headers() {
    const headers = {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    if (this.config.headers) Object.assign(headers, this.config.headers);
    return headers;
  }
}

// ============ Utility functions ============

/**
 * Compute cosine similarity between two embedding vectors
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export { AIProvider, FEATURES, cosineSimilarity };
