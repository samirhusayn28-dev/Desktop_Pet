/**
 * Desktop Pet — Glassmorphic Chat Tab Controller
 * 
 * Features:
 * - Direct IPC streaming via Electron Main Process (zero CORS/CSP issues)
 * - Automatic retry without streaming on stream errors
 * - Desktop & Browser Context status bar with privacy protection
 * - Markdown rendering with syntax-highlighted code blocks and copy buttons
 * - Human-friendly error cards with collapsible raw details expander
 */

const CHAT_LIMITS = {
  messages: 50,
  contextChars: 8000,
  rawDetails: 1200
};

class ChatTab {
  constructor() {
    this.messagesContainer = document.getElementById('chat-messages-container');
    this.inputField = document.getElementById('chat-input-field');
    this.sendBtn = document.getElementById('btn-chat-send');
    this.clearBtn = document.getElementById('btn-clear-chat');
    this.modelInfoEl = document.getElementById('chat-model-info');
    this.miniAvatarEl = document.getElementById('chat-pet-mini');
    this.contextTextEl = document.getElementById('chat-context-text');
    this.stopBtn = document.getElementById('btn-chat-stop');
    this.regenBtn = document.getElementById('btn-chat-regenerate');

    this.isGenerating = false;
    this.messages = [];
    this.petRenderer = new PetRenderer();
    this.currentContext = null;
    this.activeRequestId = null;
    this.editingIndex = null;
    this.lastUserText = '';

    this.init();
  }

  init() {
    this.syncPetAppearance();
    this.renderMiniAvatar('happy');
    this.loadHistory();
    this.setupEvents();
    this.updateModelInfo();
    this.updateContextBanner();
    this.refreshFlowButtons();
  }

  setting(path, fallback) {
    if (!window.panelController || typeof window.panelController.getSetting !== 'function') {
      return fallback;
    }
    return window.panelController.getSetting(path, fallback);
  }

  emitReaction(type, payload) {
    if (!this.setting('settings.reactions.enabled', true)) return;
    const events = this.setting('settings.reactions.events', {}) || {};
    if (events[type] === false) return;
    if (window.app && typeof window.app.emit === 'function') {
      window.app.emit(type === 'sent' ? 'chat:sent' : `chat:${type}`, payload);
    }
  }

  redactText(text) {
    let result = String(text == null ? '' : text);
    if (!this.setting('settings.privacy.redactSecrets', true)) return result;

    result = result
      .replace(/\b(sk|pk|rk|api|ai)[-_][A-Za-z0-9_-]{16,}/gi, '[REDACTED_KEY]')
      .replace(/\bgh[pousr]_[A-Za-z0-9_]{16,}/gi, '[REDACTED_TOKEN]')
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]')
      .replace(/\b(password|passwd|secret|token)\s*[:=]\s*["']?[^\s"',]+/gi, '$1=[REDACTED]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]');

    return result;
  }

  blockedByNeverSend(text) {
    const raw = this.setting('settings.privacy.neverSend', '');
    const patterns = String(raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (patterns.length === 0) return null;
    const lower = String(text || '').toLowerCase();
    return patterns.find((pattern) => lower.includes(pattern)) || null;
  }

  insertIntoInput(text) {
    if (!this.inputField) return;
    this.inputField.value = String(text || '');
    this.inputField.focus();
    this.inputField.setSelectionRange(this.inputField.value.length, this.inputField.value.length);
  }

  focusInput() {
    if (this.inputField) this.inputField.focus();
  }

  refreshFlowButtons() {
    if (this.stopBtn) this.stopBtn.disabled = !this.isGenerating;
    if (this.regenBtn) {
      this.regenBtn.disabled = this.isGenerating || !this.messages.some((m) => m.role === 'user' && !m.isError);
    }
    if (window.panelController && typeof window.panelController.setHeaderStatus === 'function') {
      window.panelController.setHeaderStatus(this.isGenerating ? 'Thinking...' : 'Ready', this.isGenerating);
    }
    if (window.panelController && typeof window.panelController.refreshStatusFooter === 'function') {
      window.panelController.refreshStatusFooter();
    }
  }

  resizeInput() {
    if (!this.inputField) return;
    this.inputField.style.height = 'auto';
    this.inputField.style.height = `${Math.min(this.inputField.scrollHeight, 140)}px`;
  }

  // In-app fallback: the main process also listens for keys in every Pixie
  // window and the macOS helper covers typing in other apps.
  notifyTyping() {
    const now = Date.now();
    if (now - (this.lastTypingSignalAt || 0) < 80) return;
    this.lastTypingSignalAt = now;
    if (window.app && typeof window.app.emit === 'function') {
      window.app.emit('pet:typing', { source: 'panel-chat' });
    }
    if (this.miniAvatarEl) {
      this.miniAvatarEl.classList.add('is-typing');
      window.clearTimeout(this.typingVisualTimer);
      this.typingVisualTimer = window.setTimeout(() => {
        if (this.miniAvatarEl) this.miniAvatarEl.classList.remove('is-typing');
      }, 1600);
    }
  }

  stopGeneration() {
    if (!this.isGenerating || !this.activeRequestId) return;
    const ipc = window.panelController && window.panelController.ipcRenderer;
    if (ipc) {
      ipc.send('ai:stop-chat', { requestId: this.activeRequestId });
    }
  }

  regenerateLast() {
    if (this.isGenerating) return;
    const lastUserIndex = this.messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIndex < 0) return;

    const text = String(this.messages[lastUserIndex].content || '').trim();
    if (!text) return;

    this.messages.splice(lastUserIndex);
    this.insertIntoInput(text);
    this.editingIndex = null;
    this.saveHistory();
    this.renderMessages();
    this.handleSend();
  }

  editMessage(index) {
    if (this.isGenerating) return;
    const msg = this.messages[index];
    if (!msg || msg.role !== 'user') return;
    this.editingIndex = index;
    this.insertIntoInput(msg.content);
  }

  branchFrom(index) {
    if (this.isGenerating) return;
    if (index < 0 || index >= this.messages.length) return;
    this.messages = this.messages.slice(0, index + 1).filter((m) => !m.isError);
    this.editingIndex = null;
    this.saveHistory();
    this.renderMessages();
    this.focusInput();
  }

  syncPetAppearance() {
    if (!window.panelController) return;
    const appearance = window.panelController.store.get('settings.appearance') || {};
    this.petRenderer.updateConfig(appearance);
  }

  renderMiniAvatar(emotion = 'happy') {
    if (this.miniAvatarEl) {
      this.syncPetAppearance();
      this.miniAvatarEl.innerHTML = this.petRenderer.render(emotion, { size: 62, idPrefix: 'chat-header-pet' });
    }
  }

  updateModelInfo() {
    if (!window.panelController) return;
    const store = window.panelController.store;
    const activeProvider = store.get('settings.ai.activeProvider') || 'gemini';
    const activeModel = store.get(`settings.ai.models.${activeProvider}`) || 'default';
    if (this.modelInfoEl) {
      this.modelInfoEl.textContent = `${activeProvider} • ${activeModel}`;
    }
  }

  async updateContextBanner() {
    if (!this.contextTextEl) return;

    if (!this.setting('settings.privacy.context', true)) {
      this.currentContext = null;
      this.contextTextEl.textContent = 'Context: off';
      return;
    }

    if (!window.panelController || !window.panelController.ipcRenderer) return;

    try {
      const ctx = await window.panelController.ipcRenderer.invoke('context:get-active');
      this.currentContext = ctx;
      if (ctx && ctx.appName) {
        let display = `Context: ${ctx.appName}`;
        if (ctx.windowTitle) display += ` — ${ctx.windowTitle}`;
        if (ctx.url) display += ` (${ctx.url})`;
        this.contextTextEl.textContent = display.slice(0, 160);
      } else {
        this.contextTextEl.textContent = 'Context: Desktop Workspace';
      }
    } catch (e) {
      this.contextTextEl.textContent = 'Context: Workspace';
    }
  }

  loadHistory() {
    if (!window.panelController) return;
    const saved = window.panelController.store.get('chatHistory');
    if (saved && Array.isArray(saved) && saved.length > 0) {
      this.messages = saved.slice(-CHAT_LIMITS.messages).map((msg) => {
        if (!msg || !msg.rawDetails) return msg;
        return { ...msg, rawDetails: String(msg.rawDetails).slice(0, CHAT_LIMITS.rawDetails) };
      });
    } else {
      this.messages = [];
    }
    this.renderMessages();
  }

  saveHistory() {
    if (!window.panelController) return;
    this.messages = this.messages.slice(-CHAT_LIMITS.messages).map((msg) => {
      if (!msg || !msg.rawDetails) return msg;
      return { ...msg, rawDetails: String(msg.rawDetails).slice(0, CHAT_LIMITS.rawDetails) };
    });
    window.panelController.store.set('chatHistory', this.messages);
    this.refreshFlowButtons();
  }

  setupEvents() {
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.handleSend());
    }

    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => this.stopGeneration());
    }

    if (this.regenBtn) {
      this.regenBtn.addEventListener('click', () => this.regenerateLast());
    }

    if (this.messagesContainer) {
      this.messagesContainer.addEventListener('click', (event) => {
        const suggestion = event.target.closest('[data-suggestion]');
        if (suggestion) {
          this.insertIntoInput(suggestion.dataset.suggestion);
          this.handleSend();
          return;
        }
        const btn = event.target.closest('[data-msg-action]');
        if (!btn) return;
        const index = Number(btn.dataset.msgIndex);
        if (btn.dataset.msgAction === 'edit') this.editMessage(index);
        if (btn.dataset.msgAction === 'regenerate') this.regenerateLast();
        if (btn.dataset.msgAction === 'branch') this.branchFrom(index);
      });
    }

    if (this.inputField) {
      this.inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.handleSend();
        }
      });
      this.inputField.addEventListener('focus', () => {
        this.updateContextBanner();
      });
      this.inputField.addEventListener('input', () => {
        this.resizeInput();
        this.notifyTyping();
      });
      this.resizeInput();
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.messages = [];
        this.editingIndex = null;
        this.lastUserText = '';
        this.saveHistory();
        this.renderMessages();
      });
    }

    // Model info is display-only in the chat-only panel.
  }

  buildOutgoingMessages() {
    const source = this.messages.slice(0, -1).filter((m) => m && !m.isError && m.content);
    const outgoing = [];
    let remaining = CHAT_LIMITS.contextChars;

    for (let i = source.length - 1; i >= 0 && remaining > 0; i--) {
      const clean = this.redactText(source[i].content).trim();
      if (!clean) continue;
      const piece = clean.slice(0, remaining);
      outgoing.unshift({ role: source[i].role === 'assistant' ? 'assistant' : 'user', content: piece });
      remaining -= piece.length;
    }

    return outgoing;
  }

  async handleSend() {
    if (this.isGenerating) return;
    const text = (this.inputField.value || '').trim();
    if (!text) return;

    const blocked = this.blockedByNeverSend(text);
    if (blocked) {
      this.inputField.value = '';
      this.resizeInput();
      this.messages.push(
        { role: 'user', content: text, timestamp: Date.now() },
        {
          role: 'assistant',
          content: `Blocked by your privacy rule: "${blocked}". Remove it in the Context section to allow this message.`,
          isError: true,
          timestamp: Date.now()
        }
      );
      this.saveHistory();
      this.renderMessages();
      return;
    }

    if (this.editingIndex !== null && this.messages[this.editingIndex] && this.messages[this.editingIndex].role === 'user') {
      this.messages.splice(this.editingIndex);
    }
    this.editingIndex = null;
    this.inputField.value = '';
    this.resizeInput();
    this.lastUserText = text;

    this.isGenerating = true;
    this.activeRequestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.messages.push({ role: 'user', content: text, timestamp: Date.now() });
    this.messages.push({ role: 'assistant', content: '', timestamp: Date.now() });
    const assistantIndex = this.messages.length - 1;

    this.renderMessages();
    this.scrollToBottom();
    this.refreshFlowButtons();

    const isThanks = /\b(thanks|thank you|thx|shukriya|shukria|jazakallah)\b/i.test(text);
    const isLove = /\b(love you|i love you|luv u|love u|pyar)\b/i.test(text);
    const sentEmotion = isThanks ? 'grateful' : isLove ? 'love' : 'thinking';
    this.renderMiniAvatar(sentEmotion);
    if (sentEmotion === 'thinking' && this.miniAvatarEl) this.miniAvatarEl.classList.add('animating');
    this.emitReaction('sent', { text, emotion: sentEmotion });

    const assistantMsgEl = this.messagesContainer.querySelector(`.chat-msg[data-index="${assistantIndex}"]`);
    const assistantBodyEl = assistantMsgEl ? assistantMsgEl.querySelector('.chat-bubble-content') : null;

    let cleanup = () => {};
    const finish = () => {
      cleanup();
      this.activeRequestId = null;
      this.isGenerating = false;
      if (this.miniAvatarEl) this.miniAvatarEl.classList.remove('animating');
      this.refreshFlowButtons();
    };

    try {
      const store = window.panelController.store;
      const ipc = window.panelController.ipcRenderer;
      const activeProviderId = store.get('settings.ai.activeProvider') || 'gemini';
      const model = store.get(`settings.ai.models.${activeProviderId}`);
      let apiKey = store.get(`settings.ai.apiKeys.${activeProviderId}`) || store.get(`settings.ai.keys.${activeProviderId}`) || '';
      if (!apiKey && ipc) {
        try {
          apiKey = await ipc.invoke('ai:get-key', activeProviderId);
        } catch (e) {}
      }
      const baseUrl = store.get(`settings.ai.baseUrls.${activeProviderId}`) || '';

      await this.updateContextBanner();

      let screenshotBase64 = null;
      const isVision = /(screen|window|look at this|what's on my screen|describe page)/i.test(text);
      if (isVision && ipc && this.setting('settings.privacy.allowScreenshot', false)) {
        try {
          screenshotBase64 = await ipc.invoke('context:capture-screen');
        } catch (e) {}
      }

      const requestId = this.activeRequestId;
      cleanup = () => {
        if (!ipc) return;
        ipc.removeAllListeners(`ai:chunk:${requestId}`);
        ipc.removeAllListeners(`ai:done:${requestId}`);
        ipc.removeAllListeners(`ai:error:${requestId}`);
      };

      let fullAnswer = '';
      let hasReceivedFirstToken = false;

      ipc.on(`ai:chunk:${requestId}`, (event, chunk) => {
        if (!hasReceivedFirstToken) {
          hasReceivedFirstToken = true;
          this.renderMiniAvatar('reading');
          this.emitReaction('token', { isFirstToken: true });
        }
        fullAnswer += chunk;
        this.messages[assistantIndex].content = fullAnswer;
        if (assistantBodyEl) {
          assistantBodyEl.innerHTML = this.formatMarkdown(fullAnswer) + '<span class="typing-cursor"></span>';
        }
        this.setupCopyButtons();
        this.scrollToBottom();
      });

      ipc.on(`ai:done:${requestId}`, (event, finalText) => {
        finish();
        this.messages[assistantIndex].content = finalText || fullAnswer;
        this.saveHistory();
        if (assistantBodyEl) {
          assistantBodyEl.innerHTML = this.formatMarkdown(this.messages[assistantIndex].content);
        }
        this.setupCopyButtons();
        this.renderMiniAvatar('happy');
        this.emitReaction('done', { text: finalText || fullAnswer });
        if (window.soundEffects) window.soundEffects.playHappy();
      });

      ipc.on(`ai:error:${requestId}`, (event, errData) => {
        finish();
        const friendlyMsg = errData.friendly || 'Could not complete request.';
        const rawDetails = String(errData.details || '').slice(0, CHAT_LIMITS.rawDetails);

        if (errData.status === 499 || /abort|cancel/i.test(friendlyMsg)) {
          this.messages[assistantIndex].content = 'Generation stopped.';
          this.messages[assistantIndex].isError = false;
          delete this.messages[assistantIndex].rawDetails;
          this.saveHistory();
          if (assistantBodyEl) {
            assistantBodyEl.innerHTML = this.formatMarkdown('Generation stopped.');
          }
          this.renderMiniAvatar('happy');
          return;
        }

        this.messages[assistantIndex].content = friendlyMsg;
        this.messages[assistantIndex].isError = true;
        this.messages[assistantIndex].rawDetails = rawDetails;
        this.saveHistory();

        if (assistantBodyEl) {
          assistantBodyEl.innerHTML = `
            <div class="chat-err-wrap">
              <div class="chat-err-headline">
                <i data-lucide="alert-circle"></i>
                <span>${this.escapeHtml(friendlyMsg)}</span>
              </div>
              ${rawDetails ? `
                <details class="chat-err-details">
                  <summary>Details</summary>
                  <pre class="err-pre"><code>${this.escapeHtml(rawDetails)}</code></pre>
                </details>
              ` : ''}
            </div>
          `;
          if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
            window.panelController.refreshIcons();
          }
        }

        this.renderMiniAvatar('sad');
        this.emitReaction('error', { error: friendlyMsg, status: errData.status });
      });

      ipc.send('ai:start-chat', {
        requestId,
        provider: activeProviderId,
        apiKey,
        model,
        baseUrl,
        messages: this.buildOutgoingMessages(),
        contextInfo: this.setting('settings.privacy.context', true) ? this.currentContext : null,
        screenshotBase64,
        suppressReactions: !this.setting('settings.reactions.enabled', true)
      });

    } catch (err) {
      finish();
      const friendly = 'AI service returned an error. Check provider configuration.';
      this.messages[assistantIndex].content = friendly;
      this.messages[assistantIndex].isError = true;
      this.messages[assistantIndex].rawDetails = String(err).slice(0, CHAT_LIMITS.rawDetails);
      this.saveHistory();

      if (assistantBodyEl) {
        assistantBodyEl.innerHTML = `
          <div class="chat-err-wrap">
            <div class="chat-err-headline">
              <i data-lucide="alert-circle"></i>
              <span>${this.escapeHtml(friendly)}</span>
            </div>
            <details class="chat-err-details">
              <summary>Details</summary>
              <pre class="err-pre"><code>${this.escapeHtml(this.messages[assistantIndex].rawDetails)}</code></pre>
            </details>
          </div>
        `;
        if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
          window.panelController.refreshIcons();
        }
      }
      this.renderMiniAvatar('confused');
      this.emitReaction('error', { error: friendly, status: 0 });
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  renderMessages() {
    if (!this.messagesContainer) return;

    if (!this.messages.length) {
      const petName = (window.panelController && window.panelController.store.get('settings.general.petName')) || 'Pixie';
      const suggestions = ['Explain this code', 'Help me debug an error', 'Summarize some text', 'Who is your creator?'];
      this.messagesContainer.innerHTML = `
        <div class="welcome">
          <div class="big">${this.petRenderer.render('happy', { size: 104, idPrefix: 'welcome-pet' })}</div>
          <h2>Hi, I'm ${this.escapeHtml(petName)}</h2>
          <div class="chips">
            ${suggestions.map((text) => `<button class="chip" data-suggestion="${this.escapeHtml(text)}">${this.escapeHtml(text)}</button>`).join('')}
          </div>
        </div>
      `;
      return;
    }

    this.messagesContainer.innerHTML = this.messages.map((msg, index) => {
      const isUser = msg.role === 'user';
      const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (isUser) {
        return `
          <div class="chat-msg user" data-index="${index}">
            <div class="msg-bubble-wrap">
              <div class="chat-bubble user-white-bubble">
                <div class="chat-bubble-content">${this.escapeHtml(msg.content)}</div>
              </div>
              <span class="msg-timestamp muted-time">${timeStr}</span>
              <div class="message-actions">
                <button class="message-action-btn" data-msg-action="edit" data-msg-index="${index}">Edit</button>
                <button class="message-action-btn" data-msg-action="branch" data-msg-index="${index}">Branch</button>
              </div>
            </div>
          </div>
        `;
      } else {
        let contentHtml = '';
        if (msg.isError) {
          contentHtml = `
            <div class="chat-err-wrap">
              <div class="chat-err-headline">
                <i data-lucide="alert-circle"></i>
                <span>${this.escapeHtml(msg.content)}</span>
              </div>
              ${msg.rawDetails ? `
                <details class="chat-err-details">
                  <summary>Details</summary>
                  <pre class="err-pre"><code>${this.escapeHtml(msg.rawDetails)}</code></pre>
                </details>
              ` : ''}
            </div>
          `;
        } else {
          contentHtml = this.formatMarkdown(msg.content || '...');
        }

        return `
          <div class="chat-msg assistant" data-index="${index}">
            <div class="msg-avatar-col">
              <div class="msg-mini-pet-avatar">
                ${this.petRenderer.render(msg.isError ? 'confused' : 'happy', { size: 34, idPrefix: `msg-pet-${index}` })}
              </div>
            </div>
            <div class="msg-bubble-wrap">
              <div class="chat-bubble ai-solid-bubble">
                <div class="chat-bubble-content">${contentHtml}</div>
              </div>
              <span class="msg-timestamp muted-time">${timeStr}</span>
              <div class="message-actions">
                <button class="message-action-btn" data-msg-action="regenerate" data-msg-index="${index}">Regenerate</button>
                <button class="message-action-btn" data-msg-action="branch" data-msg-index="${index}">Branch</button>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');

    this.setupCopyButtons();
    this.scrollToBottom();

    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }

  formatMarkdown(text) {
    if (!text) return '';
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();

    const codeBlocks = [];
    let processed = text.replace(/```([a-zA-Z0-9_-]*)\r?\n?([\s\S]*?)```/g, (match, lang, code) => {
      const rawCode = code.trim();
      const cleanLang = (lang || 'code').toUpperCase();
      const highlighted = this.highlightSyntax(rawCode, lang);
      const encodedCode = encodeURIComponent(rawCode);

      const blockHtml = `
        <div class="code-block-card">
          <div class="code-block-header">
            <div class="code-lang-tag">
              <span class="code-lang-dot"></span>
              <span>${cleanLang}</span>
            </div>
            <button class="code-copy-btn" data-code="${encodedCode}">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre class="code-pre"><code>${highlighted}</code></pre>
        </div>
      `;
      codeBlocks.push(blockHtml);
      return `__CODE_BLOCK_SLOT_${codeBlocks.length - 1}__`;
    });

    processed = this.escapeHtml(processed);
    processed = processed.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
      const level = hashes.length;
      return `<h${level}>${content}</h${level}>`;
    });
    processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    processed = processed.replace(/\n/g, '<br>');

    codeBlocks.forEach((blockHtml, i) => {
      processed = processed.replace(`__CODE_BLOCK_SLOT_${i}__`, blockHtml);
    });

    return processed;
  }

  highlightSyntax(code, lang) {
    if (!code) return '';
    const tokenRegex = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|(["'`])(?:(?=(\\?))\3[\s\S])*?\2|(\b(?:const|let|var|function|return|if|else|for|while|async|await|class|import|export|from|def|self|try|catch|finally|new|this|typeof|instanceof|switch|case|default|throw|yield|true|false|null|undefined)\b)|(\b\d+(?:\.\d+)?\b)|(=>|===|!==|==|!=|\+=|-=|\*=|\/=|&&|\|\||[{}()[\];.,+\-*\/])/g;

    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(code)) !== null) {
      if (match.index > lastIndex) {
        result += this.escapeHtml(code.slice(lastIndex, match.index));
      }

      const comment = match[1];
      const stringQuote = match[2];
      const keyword = match[4];
      const number = match[5];
      const punct = match[6];
      const full = match[0];

      if (comment) {
        result += `<span class="syn-comment">${this.escapeHtml(comment)}</span>`;
      } else if (stringQuote !== undefined) {
        result += `<span class="syn-string">${this.escapeHtml(full)}</span>`;
      } else if (keyword) {
        result += `<span class="syn-keyword">${this.escapeHtml(keyword)}</span>`;
      } else if (number) {
        result += `<span class="syn-number">${this.escapeHtml(number)}</span>`;
      } else if (punct) {
        result += `<span class="syn-punct">${this.escapeHtml(punct)}</span>`;
      } else {
        result += this.escapeHtml(full);
      }
      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < code.length) {
      result += this.escapeHtml(code.slice(lastIndex));
    }
    return result;
  }

  setupCopyButtons() {
    if (!this.messagesContainer) return;
    this.messagesContainer.querySelectorAll('.code-copy-btn').forEach(btn => {
      btn.onclick = () => {
        const rawCode = decodeURIComponent(btn.dataset.code || '');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(rawCode).then(() => {
            btn.classList.add('copied');
            const span = btn.querySelector('span');
            if (span) span.textContent = 'Copied!';
            setTimeout(() => {
              btn.classList.remove('copied');
              if (span) span.textContent = 'Copy';
            }, 2000);
          });
        }
      };
    });
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }
}

window.ChatTab = ChatTab;
