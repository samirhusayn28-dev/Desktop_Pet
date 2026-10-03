/**
 * Desktop Pet — Main Process AI Engine
 * Handles all AI HTTP communication directly in Node.js to eliminate CORS/CSP restrictions,
 * securely streams responses to the renderer, executes test connections, and parses friendly errors.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const store = require('./secure-store');

class AIService {
  constructor() {
    this.activeStreams = new Map(); // id -> AbortController
  }

  /**
   * Universal error mapper converting HTTP / API errors into human-friendly explanations
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
      code === 401 ||
      code === 403 ||
      lower.includes('invalid api key') ||
      lower.includes('api_key_invalid') ||
      lower.includes('unauthorized') ||
      lower.includes('authentication') ||
      lower.includes('permission_denied')
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
      lower.includes('model_not_found')
    ) {
      friendly = 'Model not found. Please refresh the model list in Settings -> AI Provider.';
    } else if (code === 503 || lower.includes('overloaded') || lower.includes('service unavailable')) {
      friendly = 'Provider servers are temporarily busy. Please wait a moment.';
    } else if (
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('offline') ||
      lower.includes('no internet') ||
      lower.includes('fetch failed')
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
   * Identifies specialized, regional, embedding, audio, vision-only, or moderation models
   * that MUST be excluded from auto-selection/defaults.
   */
  isExcludedFromAutoSelection(id) {
    if (!id) return true;
    const s = id.toLowerCase();
    const excludedKeywords = [
      'allam', 'whisper', 'audio', 'tts', 'embedding', 'embed',
      'moderation', 'guard', 'safeguard', 'distil-whisper', 'bilingual',
      'rerank', 'dall-e', 'clip', 'text-embedding', 'vision-preview',
      'deepseek-vl', 'qwen-vl', 'vl-'
    ];
    return excludedKeywords.some(kw => s.includes(kw));
  }

  /**
   * Chooses the highest priority general-purpose chat model from an available list
   */
  getPriorityDefaultModel(provider, availableModels = []) {
    const modelIds = availableModels.map(m => (typeof m === 'string' ? m : m.id));
    const eligible = modelIds.filter(id => !this.isExcludedFromAutoSelection(id));

    const priorityLists = {
      groq: [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'llama-3.2-3b-preview',
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma2-9b-it'
      ],
      gemini: [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
        'gemini-2.0-flash-lite',
        'gemini-1.5-pro'
      ],
      openai: [
        'gpt-4o-mini',
        'gpt-4o',
        'gpt-3.5-turbo',
        'o3-mini',
        'o1-mini'
      ],
      anthropic: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-haiku-20240307'
      ],
      deepseek: [
        'deepseek-chat',
        'deepseek-reasoner'
      ],
      ollama: [
        'llama3.3:latest',
        'llama3.2:latest',
        'llama3.1:latest',
        'llama3:latest',
        'mistral:latest',
        'qwen2.5:latest'
      ]
    };

    const prios = priorityLists[provider] || [];
    for (const p of prios) {
      const match = eligible.find(id => id.toLowerCase() === p.toLowerCase() || id.toLowerCase().startsWith(p.toLowerCase()));
      if (match) return match;
    }

    if (eligible.length > 0) return eligible[0];

    // Fixed sensible defaults if list is empty
    if (provider === 'groq') return 'llama-3.3-70b-versatile';
    if (provider === 'gemini') return 'gemini-1.5-flash';
    if (provider === 'openai') return 'gpt-4o-mini';
    if (provider === 'anthropic') return 'claude-3-5-sonnet-20241022';
    if (provider === 'deepseek') return 'deepseek-chat';
    if (provider === 'ollama') return 'llama3:latest';
    return modelIds[0] || 'default';
  }

  /**
   * Fetch dynamic model list per provider
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
            return {
              id: cleanId,
              name: m.displayName || cleanId,
              isFlash: cleanId.toLowerCase().includes('flash')
            };
          });

        list.sort((a, b) => {
          const aEx = this.isExcludedFromAutoSelection(a.id);
          const bEx = this.isExcludedFromAutoSelection(b.id);
          if (aEx !== bEx) return aEx ? 1 : -1;
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
        const list = (data.data || []).map(m => ({ id: m.id, name: m.id }));

        // Sort: General-purpose chat models at the top, specialized/regional models at the bottom
        list.sort((a, b) => {
          const aEx = this.isExcludedFromAutoSelection(a.id);
          const bEx = this.isExcludedFromAutoSelection(b.id);
          if (aEx !== bEx) return aEx ? 1 : -1;
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
        if (provider === 'qwen') defaultBase = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

        const root = (baseUrl || defaultBase).replace(/\/+$/, '');
        const headers = { 'User-Agent': 'Desktop-Pet/1.0' };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        const res = await this.makeRequest(`${root}/models`, { method: 'GET', headers });
        const data = JSON.parse(res.body);
        const list = (data.data || []).map(m => ({ id: m.id, name: m.id }));

        list.sort((a, b) => {
          const aEx = this.isExcludedFromAutoSelection(a.id);
          const bEx = this.isExcludedFromAutoSelection(b.id);
          if (aEx !== bEx) return aEx ? 1 : -1;
          return a.id.localeCompare(b.id);
        });

        return list;
      }

      if (provider === 'ollama') {
        const root = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
        const res = await this.makeRequest(`${root}/api/tags`, { method: 'GET' });
        const data = JSON.parse(res.body);
        return (data.models || []).map(m => ({ id: m.name, name: m.name }));
      }

      if (provider === 'anthropic') {
        return [
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Recommended)' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
          { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
        ];
      }

      return [{ id: 'default', name: 'Default Model' }];
    } catch (err) {
      console.warn(`[AIService] Failed to fetch dynamic models for ${provider}:`, err.message);
      throw err;
    }
  }

  /**
   * "Test connection" button per provider:
   * Sends tiny 3-token prompt and returns clear PASS/FAIL with short human-readable message.
   */
  async testConnection(provider, apiKey, model, baseUrl) {
    apiKey = (apiKey || store.getApiKey(provider) || '').trim();

    try {
      if (provider !== 'ollama' && !apiKey) {
        return {
          success: false,
          friendly: 'API key is missing. Please enter your key first.',
          details: 'Empty API key'
        };
      }

      // Auto-correct model if excluded from general chat
      let activeModel = model;
      if (!activeModel || this.isExcludedFromAutoSelection(activeModel)) {
        activeModel = this.getPriorityDefaultModel(provider);
        store.set(`settings.ai.models.${provider}`, activeModel);
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

      // 3. OpenAI / Compatible Test
      if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'qwen' || provider === 'custom') {
        let defaultBase = 'https://api.openai.com/v1';
        if (provider === 'deepseek') defaultBase = 'https://api.deepseek.com/v1';
        if (provider === 'openrouter') defaultBase = 'https://openrouter.ai/api/v1';
        if (provider === 'qwen') defaultBase = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

        const root = (baseUrl || defaultBase).replace(/\/+$/, '');
        const activeModel = model || (provider === 'openai' ? 'gpt-4o-mini' : 'default');

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
        const activeModel = model || 'claude-3-5-sonnet-20241022';

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
        const activeModel = model || 'llama3:latest';

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
   * If streaming fails, automatically retries once without streaming.
   * Handles 503 backoff retry and 404 auto-refresh.
   */
  async streamChat(requestId, params, onChunk, onDone, onError) {
    const {
      provider,
      messages,
      model,
      baseUrl,
      apiKey: passedKey,
      systemPrompt,
      contextInfo,
      screenshotBase64
    } = params;

    const apiKey = (passedKey || store.getApiKey(provider) || '').trim();

    // Prepare system prompt with pet personality, user name, and desktop context
    const petName = store.get('settings.general.petName') || 'Desktop Pet';
    const userName = (store.get('settings.general.userName') || '').trim();
    let fullSystemPrompt = systemPrompt || `You are ${petName}, a friendly desktop pet assistant. Always reply in the same language as the user's last message (default English). Keep answers concise.`;
    if (userName) {
      fullSystemPrompt += ` The user's name is ${userName}. Address them by name occasionally and naturally, not in every sentence.`;
    }
    if (contextInfo) {
      fullSystemPrompt += `\n\n[Current Desktop Context: User is in "${contextInfo.appName || 'an application'}" - Window: "${contextInfo.windowTitle || ''}"${contextInfo.url ? ` - URL: ${contextInfo.url}` : ''}]`;
    }

    // Auto-correct model if excluded from general chat (e.g. allam-2-7b)
    let activeModel = model;
    if (!activeModel || this.isExcludedFromAutoSelection(activeModel)) {
      activeModel = this.getPriorityDefaultModel(provider);
      store.set(`settings.ai.models.${provider}`, activeModel);
    }

    // Attempt streaming with retry fallback
    const executeAttempt = async (enableStreaming, attemptNum = 1) => {
      try {
        if (provider === 'gemini') {
          return await this.streamGemini(requestId, {
            apiKey,
            model: (activeModel || 'gemini-1.5-flash').replace(/^models\//, ''),
            baseUrl,
            messages,
            systemPrompt: fullSystemPrompt,
            enableStreaming,
            screenshotBase64
          }, onChunk);
        }

        if (provider === 'groq' || provider === 'openai' || provider === 'deepseek' || provider === 'openrouter' || provider === 'qwen' || provider === 'custom') {
          return await this.streamOpenAICompatible(requestId, {
            provider,
            apiKey,
            model: activeModel,
            baseUrl,
            messages,
            systemPrompt: fullSystemPrompt,
            enableStreaming,
            screenshotBase64
          }, onChunk);
        }

        if (provider === 'anthropic') {
          return await this.streamAnthropic(requestId, {
            apiKey,
            model: activeModel || 'claude-3-5-sonnet-20241022',
            baseUrl,
            messages,
            systemPrompt: fullSystemPrompt,
            enableStreaming,
            screenshotBase64
          }, onChunk);
        }

        if (provider === 'ollama') {
          return await this.streamOllama(requestId, {
            model: model || 'llama3:latest',
            baseUrl,
            messages,
            systemPrompt: fullSystemPrompt,
            enableStreaming
          }, onChunk);
        }

        // Built-in fallback companion
        const lastMsg = messages[messages.length - 1]?.content || 'Hello';
        const reply = `I'm your desktop pet companion! Configure an active AI provider in Settings -> AI Provider (Gemini, Groq, or OpenAI) to get live coding intelligence! You asked: "${lastMsg}"`;
        onChunk(reply);
        return reply;
      } catch (err) {
        // If 503 Service Unavailable, retry with backoff 1s/3s/7s (up to attempt 3)
        if (err.status === 503 && attemptNum < 3) {
          const delays = [1000, 3000, 7000];
          const delay = delays[attemptNum - 1] || 2000;
          await new Promise(r => setTimeout(r, delay));
          return executeAttempt(enableStreaming, attemptNum + 1);
        }

        // If streaming failed on attempt 1, automatically retry once without streaming!
        if (enableStreaming && attemptNum === 1) {
          console.warn(`[AIService] Streaming failed for ${provider}, retrying without streaming...`);
          return executeAttempt(false, 2);
        }

        throw err;
      }
    };

    try {
      const fullText = await executeAttempt(true, 1);
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

  // --- GEMINI DRIVER ---
  async streamGemini(requestId, opts, onChunk) {
    const { apiKey, model, baseUrl, messages, systemPrompt, enableStreaming, screenshotBase64 } = opts;
    if (!apiKey) throw new Error('Gemini API key is required');

    const root = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    const cleanModel = (model || 'gemini-1.5-flash').replace(/^models\//, '');
    const action = enableStreaming ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
    const url = `${root}/v1beta/models/${encodeURIComponent(cleanModel)}:${action}key=${encodeURIComponent(apiKey)}`;

    // Format messages for Gemini
    const contents = [];
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [{ text: msg.content || '' }];

      // Attach screenshot if present on latest user message
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
      sseBuffer = lines.pop(); // Retain remainder

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

  // --- OPENAI COMPATIBLE DRIVER (Groq, OpenAI, DeepSeek, OpenRouter, Qwen, Custom) ---
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
      defaultBase = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      defaultModel = 'qwen-turbo';
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
            const text = data.choices?.[0]?.delta?.content || '';
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

  // --- ANTHROPIC DRIVER ---
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

  // --- OLLAMA DRIVER ---
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
