/**
 * Desktop Pet — Main Process AI Engine
 * Handles all AI HTTP communication directly in Node.js to eliminate CORS/CSP restrictions,
 * securely streams responses to the renderer, executes test connections, and parses friendly errors.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const store = require('./secure-store');

/**
 * Stateful stream filter that strips <think>...</think> blocks across chunk boundaries,
 * ensuring raw internal reasoning is never exposed to the user.
 */
class ThinkingFilter {
  constructor() {
    this.inThink = false;
    this.buffer = '';
  }

  process(chunk) {
    if (!chunk) return '';
    this.buffer += chunk;
    let output = '';

    while (this.buffer.length > 0) {
      if (!this.inThink) {
        const lower = this.buffer.toLowerCase();
        const startIdx = lower.indexOf('<think>');
        if (startIdx !== -1) {
          output += this.buffer.slice(0, startIdx);
          this.buffer = this.buffer.slice(startIdx + 7);
          this.inThink = true;
          continue;
        }

        // Check if buffer ends with a partial "<think>" prefix
        let prefixFound = false;
        const target = '<think>';
        for (let len = Math.min(lower.length, target.length - 1); len >= 1; len--) {
          const tail = lower.slice(-len);
          if (target.startsWith(tail)) {
            output += this.buffer.slice(0, -len);
            this.buffer = this.buffer.slice(-len);
            prefixFound = true;
            break;
          }
        }

        if (!prefixFound) {
          output += this.buffer;
          this.buffer = '';
        }
        break;
      } else {
        // Discard reasoning until </think>
        const lower = this.buffer.toLowerCase();
        const endIdx = lower.indexOf('</think>');
        if (endIdx !== -1) {
          this.buffer = this.buffer.slice(endIdx + 8);
          this.inThink = false;
          continue;
        }

        // Check if buffer ends with a partial "</think>" prefix
        let prefixFound = false;
        const target = '</think>';
        for (let len = Math.min(lower.length, target.length - 1); len >= 1; len--) {
          const tail = lower.slice(-len);
          if (target.startsWith(tail)) {
            this.buffer = this.buffer.slice(-len);
            prefixFound = true;
            break;
          }
        }

        if (!prefixFound) {
          this.buffer = '';
        }
        break;
      }
    }

    return output;
  }

  flush() {
    let output = '';
    if (!this.inThink) {
      output += this.buffer;
    }
    this.buffer = '';
    this.inThink = false;
    return output;
  }
}

const PERSONALITY_URL = 'https://raw.githubusercontent.com/samirhusayn28-dev/Desktop_Pet/main/personality.json';

class AIService {
  constructor() {
    this.activeStreams = new Map(); // id -> AbortController
    this.cachedPersonality = null;  // fetched from GitHub at runtime
    this.personalityFetchedAt = 0;
    this.fetchPersonality();         // warm up on first load
  }

  /**
   * Fetches personality.json from the GitHub repo (main branch, raw URL).
   * Cached for 10 minutes so every chat message doesn't hit GitHub.
   * Falls back silently to an empty object if offline or fetch fails.
   */
  async fetchPersonality() {
    const TEN_MIN = 10 * 60 * 1000;
    if (this.cachedPersonality && (Date.now() - this.personalityFetchedAt) < TEN_MIN) {
      return this.cachedPersonality;
    }
    return new Promise((resolve) => {
      const req = https.get(PERSONALITY_URL, { timeout: 5000 }, (res) => {
        let raw = '';
        res.on('data', (d) => { raw += d; });
        res.on('end', () => {
          try {
            this.cachedPersonality = JSON.parse(raw);
            this.personalityFetchedAt = Date.now();
            console.log('[Personality] Fetched from GitHub:', this.cachedPersonality.creator || '?');
          } catch (e) {
            this.cachedPersonality = {};
          }
          resolve(this.cachedPersonality);
        });
      });
      req.on('error', () => { this.cachedPersonality = this.cachedPersonality || {}; resolve(this.cachedPersonality); });
      req.on('timeout', () => { req.destroy(); this.cachedPersonality = this.cachedPersonality || {}; resolve(this.cachedPersonality); });
    });
  }

  /**
   * Identifies specialized, regional, embedding, audio, speech, vision-only, or moderation models
   * that MUST be excluded from auto-selection/defaults and placed in non-chat group.
   */
  isNonChatModel(id) {
    if (!id) return true;
    const s = String(id).toLowerCase();
    const excludePatterns = [
      'tts', 'orpheus', 'whisper', 'speech', 'audio', 'transcribe',
      'realtime', 'guard', 'safeguard', 'moderation', 'embed', 'rerank',
      'allam', 'arabic', 'saudi', 'image', 'dall-e', 'imagen', 'veo',
      'bilingual', 'clip', 'vision-preview', 'vl-', 'embedding', 'distil-whisper',
      'text-embedding', 'deepseek-vl', 'qwen-vl', 'ocr'
    ];
    return excludePatterns.some(pattern => s.includes(pattern));
  }

  /**
   * Universal error mapper converting HTTP / API errors into truthful, human-friendly explanations
   */
  mapFriendlyError(err, status = 0) {
    let rawText = '';
    if (typeof err === 'string') rawText = err;
    else if (err && err.message) rawText = err.message;
    else rawText = String(err || 'Unknown error');

    let parsedJson = null;
    try {
      const match = rawText.match(/(\{[\s\S]*\})/);
      if (match) parsedJson = JSON.parse(match[1]);
      else parsedJson = JSON.parse(rawText);
    } catch (e) {
      parsedJson = null;
    }

    const code = parsedJson?.error?.code || parsedJson?.error?.status || status;
    const msg = (
      parsedJson?.error?.message ||
      parsedJson?.message ||
      parsedJson?.error ||
      rawText
    ).toString();
    const lower = msg.toLowerCase();

    let friendly = '';

    if (
      lower.includes('model_terms_required') ||
      lower.includes('requires terms acceptance') ||
      lower.includes('terms of service') ||
      lower.includes('accept the terms')
    ) {
      friendly = 'Requires terms acceptance. Please accept the terms in your provider console.';
    } else if (
      code === 401 ||
      code === 403 ||
      lower.includes('invalid api key') ||
      lower.includes('api_key_invalid') ||
      lower.includes('unauthorized') ||
      lower.includes('authentication') ||
      lower.includes('permission_denied') ||
      lower.includes('forbidden')
    ) {
      friendly = 'Invalid API key. Please check your credentials in Settings -> AI Provider.';
    } else if (
      code === 402 ||
      lower.includes('insufficient_quota') ||
      lower.includes('exceeded your current quota') ||
      lower.includes('credit') ||
      lower.includes('billing') ||
      lower.includes('no credits')
    ) {
      friendly = 'No credits on this account. Please check your billing or plan balance.';
    } else if (
      code === 429 ||
      lower.includes('rate limit') ||
      lower.includes('resource_exhausted') ||
      lower.includes('too many requests')
    ) {
      friendly = 'Rate limit reached. Please try again in a minute.';
    } else if (
      code === 404 ||
      lower.includes('not found') ||
      lower.includes('does not exist') ||
      lower.includes('model_not_found') ||
      lower.includes('not supported')
    ) {
      friendly = 'Model not found or not supported. Please refresh the model list in Settings -> AI Provider.';
    } else if (code === 503 || lower.includes('overloaded') || lower.includes('service unavailable')) {
      friendly = 'Provider servers are temporarily busy. Please wait a moment.';
    } else if (
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('offline') ||
      lower.includes('no internet') ||
      lower.includes('fetch failed') ||
      lower.includes('network')
    ) {
      friendly = 'No internet connection or provider endpoint unreachable.';
    } else if (lower.includes('abort') || lower.includes('cancelled')) {
      friendly = 'Request cancelled.';
    } else {
      const firstLine = msg.split('\n')[0].slice(0, 100).trim();
      friendly = firstLine.startsWith('{') ? 'Service returned an error. Check Settings -> AI Provider.' : firstLine;
    }

    return {
      friendly,
      details: rawText
    };
  }

  /**
   * Helper to make HTTP requests in Node.js
   */
  makeRequest(urlStr, options = {}, postData = null, onChunk = null) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || 'GET',
        headers: Object.assign({}, options.headers || {}),
        timeout: options.timeout || 35000
      };

      if (postData && !reqOptions.headers['Content-Length']) {
        reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = transport.request(reqOptions, (res) => {
        const statusCode = res.statusCode || 0;
        let responseBody = '';

        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          responseBody += chunk;
          if (typeof onChunk === 'function') {
            onChunk(chunk);
          }
        });

        res.on('end', () => {
          if (statusCode >= 200 && statusCode < 300) {
            resolve({ statusCode, body: responseBody, headers: res.headers });
          } else {
            const err = new Error(responseBody || `HTTP ${statusCode}`);
            err.status = statusCode;
            err.body = responseBody;
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        const err = new Error('Connection timed out');
        err.status = 408;
        reject(err);
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          req.destroy();
          const err = new Error('Request aborted');
          err.status = 499;
          reject(err);
        });
      }

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Chooses the highest priority general-purpose chat model from an available list
   * Groq: llama versatile/instant, gpt-oss, qwen, kimi;
   * OpenAI: newest gpt mini;
   * Gemini: newest flash;
   * DeepSeek: chat;
   * Qwen: plus/turbo/max;
   * OpenRouter: first sensible chat model;
   * else first remaining chat model.
   */
  getPriorityDefaultModel(provider, availableModels = []) {
    const modelIds = availableModels.map(m => (typeof m === 'string' ? m : m.id));
    const eligible = modelIds.filter(id => !this.isNonChatModel(id));

    if (provider === 'groq') {
      const match =
        eligible.find(id => /llama-3\.[1-9]-.*versatile/i.test(id)) ||
        eligible.find(id => /llama-3\.[1-9]-.*instant/i.test(id)) ||
        eligible.find(id => /llama-3.*versatile/i.test(id)) ||
        eligible.find(id => /llama-3.*instant/i.test(id)) ||
        eligible.find(id => /gpt-oss/i.test(id)) ||
        eligible.find(id => /qwen/i.test(id)) ||
        eligible.find(id => /kimi/i.test(id)) ||
        eligible.find(id => /llama/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'llama-3.3-70b-versatile';
    }

    if (provider === 'openai') {
      const match =
        eligible.find(id => /^gpt-4o-mini/i.test(id)) ||
        eligible.find(id => /mini/i.test(id)) ||
        eligible.find(id => /^gpt-4o/i.test(id)) ||
        eligible.find(id => /^gpt-4/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'gpt-4o-mini';
    }

    if (provider === 'gemini') {
      const match =
        eligible.find(id => /gemini-2\.5-flash/i.test(id)) ||
        eligible.find(id => /gemini-2\.0-flash/i.test(id)) ||
        eligible.find(id => /gemini-2\.0-flash-lite/i.test(id)) ||
        eligible.find(id => /gemini-1\.5-flash/i.test(id)) ||
        eligible.find(id => /flash/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'gemini-2.0-flash-lite';
    }

    if (provider === 'deepseek') {
      const match =
        eligible.find(id => /deepseek-chat/i.test(id)) ||
        eligible.find(id => /chat/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'deepseek-chat';
    }

    if (provider === 'qwen') {
      const match =
        eligible.find(id => /qwen-plus/i.test(id)) ||
        eligible.find(id => /qwen-turbo/i.test(id)) ||
        eligible.find(id => /qwen-max/i.test(id)) ||
        eligible.find(id => /qwen/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'qwen-plus';
    }

    if (provider === 'openrouter') {
      const match =
        eligible.find(id => /llama-3\.[1-9]/i.test(id)) ||
        eligible.find(id => /claude-3-5/i.test(id)) ||
        eligible.find(id => /gpt-4o/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'meta-llama/llama-3.3-70b-instruct';
    }

    if (provider === 'anthropic') {
      const match =
        eligible.find(id => /claude-3-5-sonnet/i.test(id)) ||
        eligible.find(id => /claude-3-5-haiku/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'claude-3-5-sonnet-20241022';
    }

    if (provider === 'ollama') {
      const match =
        eligible.find(id => /llama3\.[1-9]/i.test(id)) ||
        eligible.find(id => /llama3/i.test(id)) ||
        eligible.find(id => /mistral/i.test(id)) ||
        eligible.find(id => /qwen/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'llama3:latest';
    }

    if (eligible.length > 0) return eligible[0];
    return modelIds[0] || 'default';
  }

  /**
   * Fetch dynamic model list per provider with chat/non-chat classification
   */
  async fetchModels(provider, apiKey, baseUrl) {
    apiKey = (apiKey || store.getApiKey(provider) || '').trim();

    try {
      if (provider === 'gemini') {
        const root = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
        if (!apiKey) throw new Error('API key required to list models');

        const url = `${root}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await this.makeRequest(url, { method: 'GET' });
        const data = JSON.parse(res.body);

        const list = (data.models || [])
          .filter(m => {
            const methods = m.supportedGenerationMethods || [];
            return methods.includes('generateContent');
          })
          .map(m => {
            const rawName = m.name || '';
            const cleanId = rawName.replace(/^models\//, '');
            const isChat = !this.isNonChatModel(cleanId);
            return {
              id: cleanId,
              name: m.displayName || cleanId,
              isChat,
              isFlash: cleanId.toLowerCase().includes('flash')
            };
          });

        list.sort((a, b) => {
          if (a.isChat !== b.isChat) return a.isChat ? -1 : 1;
          return (b.isFlash ? 1 : 0) - (a.isFlash ? 1 : 0);
        });
        return list;
      }

      if (provider === 'groq') {
        const root = (baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
        const res = await this.makeRequest(`${root}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'Desktop-Pet/1.0'
          }
        });
        const data = JSON.parse(res.body);
        const list = (data.data || []).map(m => ({
          id: m.id,
          name: m.id,
          isChat: !this.isNonChatModel(m.id)
        }));

        list.sort((a, b) => {
          if (a.isChat !== b.isChat) return a.isChat ? -1 : 1;
          const aLlama = a.id.includes('llama-3.3') || a.id.includes('llama-3.1');
          const bLlama = b.id.includes('llama-3.3') || b.id.includes('llama-3.1');
          if (aLlama !== bLlama) return bLlama ? 1 : -1;
          return a.id.localeCompare(b.id);
        });

        return list;
      }

      if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'qwen' || provider === 'custom') {
        let defaultBase = 'https://api.openai.com/v1';
        if (provider === 'deepseek') defaultBase = 'https://api.deepseek.com/v1';
        if (provider === 'openrouter') defaultBase = 'https://openrouter.ai/api/v1';
        if (provider === 'qwen') defaultBase = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

        const root = (baseUrl || defaultBase).replace(/\/+$/, '');
        const headers = { 'User-Agent': 'Desktop-Pet/1.0' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await this.makeRequest(`${root}/models`, { method: 'GET', headers });
        const data = JSON.parse(res.body);
        const list = (data.data || []).map(m => ({
          id: m.id,
          name: m.id,
          isChat: !this.isNonChatModel(m.id)
        }));

        list.sort((a, b) => {
          if (a.isChat !== b.isChat) return a.isChat ? -1 : 1;
          return a.id.localeCompare(b.id);
        });

        return list;
      }

      if (provider === 'ollama') {
        const root = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
        const res = await this.makeRequest(`${root}/api/tags`, { method: 'GET' });
        const data = JSON.parse(res.body);
        return (data.models || []).map(m => ({
          id: m.name,
          name: m.name,
          isChat: !this.isNonChatModel(m.name)
        }));
      }

      if (provider === 'anthropic') {
        return [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Recommended)', isChat: true },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', isChat: true },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', isChat: true }
        ];
      }

      return [{ id: 'default', name: 'Default Model', isChat: true }];
    } catch (err) {
      console.warn(`[AIService] Failed to fetch dynamic models for ${provider}:`, err.message);
      throw err;
    }
  }

  /**
   * "Test connection" button per provider:
   * Uses the selected model and returns true result (PASS/FAIL with truthful message).
   */
  async testConnection(provider, apiKey, model, baseUrl) {
    apiKey = (apiKey || store.getApiKey(provider) || store.get(`settings.ai.apiKeys.${provider}`) || '').trim();

    try {
      if (provider !== 'ollama' && !apiKey) {
        return {
          success: false,
          friendly: 'API key is missing. Please enter your key first.',
          details: 'Empty API key'
        };
      }

      // Use selected model, or fallback to priority default chat model
      let activeModel = model || store.get(`settings.ai.models.${provider}`);
      if (!activeModel || this.isNonChatModel(activeModel)) {
        activeModel = this.getPriorityDefaultModel(provider);
      }

      // 1. Google Gemini Test
      if (provider === 'gemini') {
        const root = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
        let cleanModel = activeModel.replace(/^models\//, '');

        const url = `${root}/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const payload = JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 3 }
        });

        await this.makeRequest(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, payload);

        return {
          success: true,
          friendly: `Connection successful! ${cleanModel} is active and ready.`,
          details: 'OK 200'
        };
      }

      // 2. Groq Test
      if (provider === 'groq') {
        const root = (baseUrl || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');

        const payload = JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 3
        });

        await this.makeRequest(`${root}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'Desktop-Pet/1.0'
          }
        }, payload);

        return {
          success: true,
          friendly: `Connection successful! Groq (${activeModel}) responded.`,
          details: 'OK 200'
        };
      }

      // 3. OpenAI / Compatible Test (OpenAI, DeepSeek, Qwen, OpenRouter, Custom)
      if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'qwen' || provider === 'custom') {
        let defaultBase = 'https://api.openai.com/v1';
        if (provider === 'deepseek') defaultBase = 'https://api.deepseek.com/v1';
        if (provider === 'openrouter') defaultBase = 'https://openrouter.ai/api/v1';
        if (provider === 'qwen') defaultBase = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

        const root = (baseUrl || defaultBase).replace(/\/+$/, '');

        const payload = JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 3
        });

        await this.makeRequest(`${root}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'Desktop-Pet/1.0'
          }
        }, payload);

        return {
          success: true,
          friendly: `Connection successful! ${provider} (${activeModel}) responded.`,
          details: 'OK 200'
        };
      }

      // 4. Anthropic Test
      if (provider === 'anthropic') {
        const root = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');

        const payload = JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 3
        });

        await this.makeRequest(`${root}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          }
        }, payload);

        return {
          success: true,
          friendly: `Connection successful! Claude (${activeModel}) responded.`,
          details: 'OK 200'
        };
      }

      // 5. Ollama Test
      if (provider === 'ollama') {
        const root = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');

        const payload = JSON.stringify({
          model: activeModel,
          messages: [{ role: 'user', content: 'hi' }],
          stream: false
        });

        await this.makeRequest(`${root}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, payload);

        return {
          success: true,
          friendly: `Connection successful! Local Ollama (${activeModel}) responded.`,
          details: 'OK 200'
        };
      }

      return {
        success: true,
        friendly: 'Built-in companion is ready.',
        details: 'OK'
      };
    } catch (err) {
      const mapped = this.mapFriendlyError(err, err.status);
      return {
        success: false,
        friendly: mapped.friendly,
        details: mapped.details
      };
    }
  }

  /**
   * Main streaming chat method executed in main process
   * - System prompt delivered in provider's exact required field
   * - Strips <think> blocks and ignores reasoning_content/thinking
   * - Retries 503 with backoff 1s/3s/7s
   * - Retries once without streaming on streaming failure
   * - Auto-falls back to next chat model (max 2) on terms/404/not-supported/access-denied
   */
  async streamChat(requestId, params, onChunk, onDone, onError) {
    const {
      provider,
      messages,
      model,
      baseUrl,
      apiKey: passedKey,
      contextInfo,
      screenshotBase64
    } = params;

    const apiKey = (passedKey || store.getApiKey(provider) || store.get(`settings.ai.apiKeys.${provider}`) || '').trim();

    // Required System Prompt:
    // "You are <pet name>, a friendly desktop pet assistant. The user's name is <user name>; use it occasionally. Always reply in the same language and script as the user's last message (English by default; if the user writes Roman Urdu/Hinglish reply in Roman Urdu/Hinglish). Be concise."
    // Fetch live personality from GitHub (cached 10 min — no release needed to update)
    const personality = await this.fetchPersonality();
    const petName = store.get('settings.general.petName') || 'Desktop Pet';
    const userName = (store.get('settings.general.userName') || '').trim();
    let fullSystemPrompt = `You are ${petName}, a friendly desktop pet AI assistant that lives on the user's desktop.`;

    // Inject remote personality (push personality.json to GitHub to update without a release)
    if (personality && personality.extraPrompt) {
      fullSystemPrompt += ` ${personality.extraPrompt.replace(/\$\{petName\}/g, petName)}`;
    } else {
      // Hardcoded fallback if GitHub is unreachable
      fullSystemPrompt += ` You were created by Samir Husayn, an indie developer. If anyone asks who made you, who your creator is, who built you, or who developed you — always say "I was created by Samir Husayn." Never claim to be made by Google, OpenAI, Anthropic, or any other company.`;
    }

    if (userName) {
      fullSystemPrompt += ` The user's name is ${userName}; use it occasionally.`;
    }
    fullSystemPrompt += ` Always reply in the same language and script as the user's last message (English by default; if the user writes Roman Urdu/Hinglish reply in Roman Urdu/Hinglish). Be concise.`;

    if (contextInfo && store.get('settings.privacy.contextAwareness') !== false) {
      fullSystemPrompt += `\n\n[Current Desktop Context: User is in "${contextInfo.appName || 'an application'}" - Window: "${contextInfo.windowTitle || ''}"${contextInfo.url ? ` - URL: ${contextInfo.url}` : ''}]`;
    }

    // Clean and validate messages list: keep roles correct, trim history to fit
    const cleanedMessages = [];
    const rawMessages = Array.isArray(messages) ? messages : [];
    for (const m of rawMessages) {
      if (!m || m.isError || !m.content) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const cleanContent = String(m.content)
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\/?think>/gi, '')
        .trim();
      if (!cleanContent) continue;

      if (cleanedMessages.length > 0 && cleanedMessages[cleanedMessages.length - 1].role === role) {
        cleanedMessages[cleanedMessages.length - 1].content += '\n\n' + cleanContent;
      } else {
        cleanedMessages.push({ role, content: cleanContent });
      }
    }

    // Trim to last 10 messages, ensuring first is 'user'
    while (cleanedMessages.length > 10) {
      cleanedMessages.shift();
    }
    while (cleanedMessages.length > 0 && cleanedMessages[0].role !== 'user') {
      cleanedMessages.shift();
    }
    if (cleanedMessages.length === 0) {
      cleanedMessages.push({ role: 'user', content: 'Hello' });
    }

    // Check if saved/selected model is non-chat; migrate if needed
    let activeModel = model || store.get(`settings.ai.models.${provider}`);
    if (!activeModel || this.isNonChatModel(activeModel)) {
      activeModel = this.getPriorityDefaultModel(provider);
      store.set(`settings.ai.models.${provider}`, activeModel);
    }

    let switchNotice = '';
    let modelSwitchCount = 0;
    const triedModels = new Set([String(activeModel).toLowerCase()]);

    const executeAttempt = async (modelToUse, enableStreaming, attemptNum = 1) => {
      try {
        const chunkFilter = new ThinkingFilter();
        const filteredOnChunk = (rawChunk) => {
          const cleanChunk = chunkFilter.process(rawChunk);
          if (cleanChunk && typeof onChunk === 'function') {
            onChunk(cleanChunk);
          }
        };

        let result = '';
        if (provider === 'gemini') {
          result = await this.streamGemini(requestId, {
            apiKey,
            model: (modelToUse || 'gemini-2.0-flash-lite').replace(/^models\//, ''),
            baseUrl,
            messages: cleanedMessages,
            systemPrompt: fullSystemPrompt,
            enableStreaming,
            screenshotBase64
          }, filteredOnChunk);
        } else if (provider === 'groq' || provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'qwen' || provider === 'custom') {
          result = await this.streamOpenAICompatible(requestId, {
            provider,
            apiKey,
            model: modelToUse,
            baseUrl,
            messages: cleanedMessages,
            systemPrompt: fullSystemPrompt,
            enableStreaming,
            screenshotBase64
          }, filteredOnChunk);
        } else if (provider === 'anthropic') {
          result = await this.streamAnthropic(requestId, {
            apiKey,
            model: modelToUse || 'claude-3-5-sonnet-20241022',
            baseUrl,
            messages: cleanedMessages,
            systemPrompt: fullSystemPrompt,
            enableStreaming,
            screenshotBase64
          }, filteredOnChunk);
        } else if (provider === 'ollama') {
          result = await this.streamOllama(requestId, {
            model: modelToUse || 'llama3:latest',
            baseUrl,
            messages: cleanedMessages,
            systemPrompt: fullSystemPrompt,
            enableStreaming
          }, filteredOnChunk);
        } else {
          result = `I'm your desktop pet companion! Configure an active AI provider in Settings -> AI Provider.`;
          filteredOnChunk(result);
        }

        const remaining = chunkFilter.flush();
        if (remaining && typeof onChunk === 'function') {
          onChunk(remaining);
        }

        let finalResponse = (result + remaining)
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<\/?think>/gi, '')
          .trim();

        if (switchNotice) {
          finalResponse = `${switchNotice}${finalResponse}`;
        }
        return finalResponse;

      } catch (err) {
        const errMsg = String(err.message || err.body || err).toLowerCase();
        const status = err.status || 0;

        // 503 busy: backoff retry 1s/3s/7s
        const is503 = status === 503 || errMsg.includes('503') || errMsg.includes('overloaded') || errMsg.includes('service unavailable');
        if (is503 && attemptNum < 3) {
          const delays = [1000, 3000, 7000];
          const delay = delays[attemptNum - 1] || 2000;
          await new Promise(r => setTimeout(r, delay));
          return executeAttempt(modelToUse, enableStreaming, attemptNum + 1);
        }

        // Check if model failed with terms acceptance, 404, not-supported, access-denied
        const isModelIssue =
          status === 404 ||
          errMsg.includes('terms') ||
          errMsg.includes('model_terms_required') ||
          errMsg.includes('not found') ||
          errMsg.includes('model_not_found') ||
          errMsg.includes('not supported') ||
          errMsg.includes('unsupported') ||
          errMsg.includes('access denied') ||
          errMsg.includes('permission_denied') ||
          errMsg.includes('does not exist');

        if (isModelIssue && modelSwitchCount < 2) {
          modelSwitchCount++;
          console.warn(`[AIService] Model ${modelToUse} failed. Auto-trying next chat model (attempt ${modelSwitchCount}/2)...`);

          let available = [];
          try {
            available = await this.fetchModels(provider, apiKey, baseUrl);
          } catch (e) {
            available = [];
          }

          const chatCandidates = available
            .map(m => (typeof m === 'string' ? m : m.id))
            .filter(id => !this.isNonChatModel(id) && !triedModels.has(id.toLowerCase()));

          let nextModel = '';
          if (chatCandidates.length > 0) {
            nextModel = this.getPriorityDefaultModel(provider, chatCandidates);
          } else {
            const fb = this.getPriorityDefaultModel(provider);
            if (!triedModels.has(fb.toLowerCase())) {
              nextModel = fb;
            }
          }

          if (nextModel && nextModel !== modelToUse) {
            triedModels.add(nextModel.toLowerCase());
            store.set(`settings.ai.models.${provider}`, nextModel);
            switchNotice = `Switched to ${nextModel}.\n\n`;
            if (typeof onChunk === 'function') {
              onChunk(switchNotice);
            }
            return executeAttempt(nextModel, true, 1);
          }
        }

        // If streaming failed on attempt 1, retry once without streaming
        if (enableStreaming && attemptNum === 1 && !errMsg.includes('key') && !errMsg.includes('quota') && !errMsg.includes('terms')) {
          console.warn(`[AIService] Streaming failed for ${provider}, retrying without streaming...`);
          return executeAttempt(modelToUse, false, 2);
        }

        throw err;
      }
    };

    try {
      const fullText = await executeAttempt(activeModel, true, 1);
      if (typeof onDone === 'function') onDone(fullText);
    } catch (err) {
      const mapped = this.mapFriendlyError(err, err.status);
      if (typeof onError === 'function') {
        onError({
          friendly: mapped.friendly,
          details: mapped.details,
          status: err.status || 0
        });
      }
    }
  }

  // --- GEMINI DRIVER (streamGenerateContent with alt=sse, systemInstruction, role "model") ---
  async streamGemini(requestId, opts, onChunk) {
    const { apiKey, model, baseUrl, messages, systemPrompt, enableStreaming, screenshotBase64 } = opts;
    if (!apiKey) throw new Error('Gemini API key is required');

    const root = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const cleanModel = (model || 'gemini-2.0-flash-lite').replace(/^models\//, '');
    const action = enableStreaming ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
    const url = `${root}/v1beta/models/${encodeURIComponent(cleanModel)}:${action}key=${encodeURIComponent(apiKey)}`;

    const contents = [];
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [{ text: msg.content || '' }];

      if (role === 'user' && msg === messages[messages.length - 1] && screenshotBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
          }
        });
      }

      contents.push({ role, parts });
    }

    const payload = JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] }
    });

    let accumulatedText = '';
    let sseBuffer = '';

    await this.makeRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, payload, (chunk) => {
      if (!enableStreaming) return;

      sseBuffer += chunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (text) {
              accumulatedText += text;
              onChunk(text);
            }
          } catch (e) {}
        }
      }
    }).then(res => {
      if (!enableStreaming) {
        const data = JSON.parse(res.body);
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        accumulatedText = text;
        onChunk(text);
      }
    });

    return accumulatedText;
  }

  // --- OPENAI-COMPATIBLE DRIVER (OpenAI, Groq, DeepSeek, Qwen, OpenRouter, Custom) ---
  async streamOpenAICompatible(requestId, opts, onChunk) {
    const { provider, apiKey, model, baseUrl, messages, systemPrompt, enableStreaming, screenshotBase64 } = opts;
    if (!apiKey) throw new Error(`${provider} API key is required`);

    let defaultBase = 'https://api.openai.com/v1';
    let defaultModel = 'gpt-4o-mini';

    if (provider === 'groq') {
      defaultBase = 'https://api.groq.com/openai/v1';
      defaultModel = 'llama-3.3-70b-versatile';
    } else if (provider === 'deepseek') {
      defaultBase = 'https://api.deepseek.com/v1';
      defaultModel = 'deepseek-chat';
    } else if (provider === 'openrouter') {
      defaultBase = 'https://openrouter.ai/api/v1';
      defaultModel = 'meta-llama/llama-3.3-70b-instruct';
    } else if (provider === 'qwen') {
      defaultBase = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
      defaultModel = 'qwen-plus';
    }

    const root = (baseUrl || defaultBase).replace(/\/+$/, '');
    const activeModel = model || defaultModel;

    const formattedMessages = [{ role: 'system', content: systemPrompt }];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (i === messages.length - 1 && msg.role === 'user' && screenshotBase64) {
        formattedMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: msg.content || '' },
            {
              type: 'image_url',
              image_url: {
                url: screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/png;base64,${screenshotBase64}`
              }
            }
          ]
        });
      } else {
        formattedMessages.push({ role: msg.role, content: msg.content || '' });
      }
    }

    const payload = JSON.stringify({
      model: activeModel,
      messages: formattedMessages,
      stream: enableStreaming
    });

    let accumulatedText = '';
    let sseBuffer = '';

    await this.makeRequest(`${root}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Desktop-Pet/1.0'
      }
    }, payload, (chunk) => {
      if (!enableStreaming) return;

      sseBuffer += chunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            // Ignore raw reasoning fields
            const delta = data.choices?.[0]?.delta;
            const text = delta?.content || '';
            if (text) {
              accumulatedText += text;
              onChunk(text);
            }
          } catch (e) {}
        }
      }
    }).then(res => {
      if (!enableStreaming) {
        const data = JSON.parse(res.body);
        const text = data.choices?.[0]?.message?.content || '';
        accumulatedText = text;
        onChunk(text);
      }
    });

    return accumulatedText;
  }

  // --- ANTHROPIC MESSAGES API DRIVER ---
  // (x-api-key, anthropic-version header, top-level system, required max_tokens, SSE event types)
  async streamAnthropic(requestId, opts, onChunk) {
    const { apiKey, model, baseUrl, messages, systemPrompt, enableStreaming, screenshotBase64 } = opts;
    if (!apiKey) throw new Error('Anthropic API key is required');

    const root = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const activeModel = model || 'claude-3-5-sonnet-20241022';

    const formattedMessages = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (i === messages.length - 1 && msg.role === 'user' && screenshotBase64) {
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
              }
            },
            { type: 'text', text: msg.content || '' }
          ]
        });
      } else {
        formattedMessages.push({ role: msg.role, content: msg.content || '' });
      }
    }

    const payload = JSON.stringify({
      model: activeModel,
      messages: formattedMessages,
      system: systemPrompt,
      max_tokens: 1500,
      stream: enableStreaming
    });

    let accumulatedText = '';
    let sseBuffer = '';

    await this.makeRequest(`${root}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    }, payload, (chunk) => {
      if (!enableStreaming) return;

      sseBuffer += chunk;
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'content_block_delta' && data.delta?.text) {
              accumulatedText += data.delta.text;
              onChunk(data.delta.text);
            }
          } catch (e) {}
        }
      }
    }).then(res => {
      if (!enableStreaming) {
        const data = JSON.parse(res.body);
        const text = (data.content || []).map(b => b.text || '').join('');
        accumulatedText = text;
        onChunk(text);
      }
    });

    return accumulatedText;
  }

  // --- OLLAMA /api/chat NDJSON DRIVER ---
  async streamOllama(requestId, opts, onChunk) {
    const { model, baseUrl, messages, systemPrompt, enableStreaming } = opts;
    const root = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');

    const formattedMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    const payload = JSON.stringify({
      model: model || 'llama3:latest',
      messages: formattedMessages,
      stream: enableStreaming
    });

    let accumulatedText = '';
    let lineBuffer = '';

    await this.makeRequest(`${root}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, payload, (chunk) => {
      if (!enableStreaming) return;

      lineBuffer += chunk;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const text = data.message?.content || '';
          if (text) {
            accumulatedText += text;
            onChunk(text);
          }
        } catch (e) {}
      }
    }).then(res => {
      if (!enableStreaming) {
        const data = JSON.parse(res.body);
        const text = data.message?.content || '';
        accumulatedText = text;
        onChunk(text);
      }
    });

    return accumulatedText;
  }
}

module.exports = new AIService();
