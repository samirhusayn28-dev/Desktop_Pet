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

class ChatTab {
  constructor() {
    this.messagesContainer = document.getElementById('chat-messages-container');
    this.inputField = document.getElementById('chat-input-field');
    this.sendBtn = document.getElementById('btn-chat-send');
    this.clearBtn = document.getElementById('btn-clear-chat');
    this.modelInfoEl = document.getElementById('chat-model-info');
    this.miniAvatarEl = document.getElementById('chat-pet-mini');
    this.contextTextEl = document.getElementById('chat-context-text');

    this.isGenerating = false;
    this.messages = [];
    this.petRenderer = new PetRenderer();
    this.currentContext = null;

    this.init();
  }

  init() {
    this.syncPetAppearance();
    this.renderMiniAvatar('happy');
    this.loadHistory();
    this.setupEvents();
    this.updateModelInfo();
    this.updateContextBanner();
  }

  syncPetAppearance() {
    if (!window.panelController) return;
    const appearance = window.panelController.store.get('settings.appearance') || {};
    this.petRenderer.updateConfig(appearance);
  }

  renderMiniAvatar(emotion = 'happy') {
    if (this.miniAvatarEl) {
      this.syncPetAppearance();
      this.miniAvatarEl.innerHTML = this.petRenderer.render(emotion, { size: 34, idPrefix: 'chat-header-pet' });
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
    if (!window.panelController || !window.panelController.ipcRenderer || !this.contextTextEl) return;

    try {
      const ctx = await window.panelController.ipcRenderer.invoke('context:get-active');
      this.currentContext = ctx;
      if (ctx && ctx.appName) {
        let display = `Context: ${ctx.appName}`;
        if (ctx.windowTitle) display += ` — ${ctx.windowTitle}`;
        if (ctx.url) display += ` (${ctx.url})`;
        this.contextTextEl.textContent = display;
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
      this.messages = saved;
    } else {
      this.messages = [
        {
          role: 'user',
          content: "Can you show me a clean debounce function in JavaScript?",
          timestamp: Date.now() - 45000
        },
        {
          role: 'assistant',
          content: "Here is a clean debounce utility with custom delay:\n\n```js\n// Debounce helper for high-frequency events\nconst debounce = (fn, delay = 250) => {\n  let timerId = null;\n  return (...args) => {\n    clearTimeout(timerId);\n    timerId = setTimeout(() => fn(...args), delay);\n  };\n};\n```\n\nWhat would you like to build or optimize next?",
          timestamp: Date.now() - 15000
        }
      ];
      this.saveHistory();
    }
    this.renderMessages();
  }

  saveHistory() {
    if (!window.panelController) return;
    window.panelController.store.set('chatHistory', this.messages);
  }

  setupEvents() {
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.handleSend());
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
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        const petName = window.panelController ? (window.panelController.store.get('settings.general.petName') || 'Pet') : 'Pet';
        this.messages = [
          {
            role: 'assistant',
            content: `Cleared conversation! I'm ${petName}, your pair programming assistant. Ask me anything!`,
            timestamp: Date.now()
          }
        ];
        this.saveHistory();
        this.renderMessages();
      });
    }

    if (this.modelInfoEl) {
      this.modelInfoEl.addEventListener('click', () => {
        if (window.panelController) {
          window.panelController.switchTab('settings');
        }
      });
    }
  }

  async handleSend() {
    if (this.isGenerating) return;
    const text = (this.inputField.value || '').trim();
    if (!text) return;

    this.inputField.value = '';
    this.isGenerating = true;

    // 1. Add User Message
    this.messages.push({
      role: 'user',
      content: text,
      timestamp: Date.now()
    });

    // 2. Add placeholder Assistant Message
    const assistantIndex = this.messages.length;
    this.messages.push({
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    });

    this.renderMessages();
    this.scrollToBottom();

    // Pet reaction: grateful on thanks, otherwise thinking
    const isThanks = /\b(thanks|thank you|thx|ty|shukriya|dhanyawad|arigato)\b/i.test(text);
    if (isThanks) {
      this.renderMiniAvatar('grateful');
      window.panelController.notifyPet('pet:set-state', { state: 'grateful', duration: 4000, priority: 4 });
    } else {
      this.renderMiniAvatar('thinking');
      if (this.miniAvatarEl) this.miniAvatarEl.classList.add('animating');
      window.panelController.notifyPet('pet:set-state', { state: 'thinking', duration: 15000, priority: 2 });
    }

    const assistantMsgEl = this.messagesContainer.querySelector(`.chat-msg[data-index="${assistantIndex}"]`);
    const assistantBodyEl = assistantMsgEl ? assistantMsgEl.querySelector('.chat-bubble-content') : null;

    try {
      const store = window.panelController.store;
      const activeProviderId = store.get('settings.ai.activeProvider') || 'gemini';
      const model = store.get(`settings.ai.models.${activeProviderId}`);
      const baseUrl = store.get(`settings.ai.baseUrls.${activeProviderId}`);
      const petName = store.get('settings.general.petName') || 'Bolt';

      // Refresh desktop context
      await this.updateContextBanner();

      // Check if vision query
      let screenshotBase64 = null;
      const isVision = /(screen|window|look at this|what's on my screen|describe page)/i.test(text);
      if (isVision && window.panelController.ipcRenderer) {
        try {
          screenshotBase64 = await window.panelController.ipcRenderer.invoke('context:capture-screen');
        } catch (e) {}
      }

      let fullAnswer = '';
      const requestId = 'req_' + Date.now();
      const ipc = window.panelController.ipcRenderer;

      const cleanup = () => {
        ipc.removeAllListeners(`ai:chunk:${requestId}`);
        ipc.removeAllListeners(`ai:done:${requestId}`);
        ipc.removeAllListeners(`ai:error:${requestId}`);
      };

      ipc.on(`ai:chunk:${requestId}`, (e, chunk) => {
        fullAnswer += chunk;
        this.messages[assistantIndex].content = fullAnswer;
        if (assistantBodyEl) {
          assistantBodyEl.innerHTML = this.formatMarkdown(fullAnswer) + '<span class="typing-cursor"></span>';
        }
        this.setupCopyButtons();
        this.scrollToBottom();
      });

      ipc.on(`ai:done:${requestId}`, (e, finalText) => {
        cleanup();
        this.messages[assistantIndex].content = finalText || fullAnswer;
        this.saveHistory();
        if (assistantBodyEl) {
          assistantBodyEl.innerHTML = this.formatMarkdown(this.messages[assistantIndex].content);
        }
        this.setupCopyButtons();

        this.renderMiniAvatar('happy');
        if (this.miniAvatarEl) this.miniAvatarEl.classList.remove('animating');
        window.panelController.notifyPet('pet:set-state', { state: 'happy', duration: 3500 });
        if (window.soundEffects) window.soundEffects.playHappy();
        this.isGenerating = false;
      });

      ipc.on(`ai:error:${requestId}`, (e, errData) => {
        cleanup();
        const friendlyMsg = errData.friendly || 'Could not complete request.';
        const rawDetails = errData.details || '';

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

        this.renderMiniAvatar('confused');
        if (this.miniAvatarEl) this.miniAvatarEl.classList.remove('animating');
        window.panelController.notifyPet('pet:set-state', { state: 'confused', duration: 4500, priority: 5 });
        this.isGenerating = false;
      });

      // Dispatch to Electron Node Main Process
      ipc.send('ai:start-chat', {
        requestId,
        provider: activeProviderId,
        model,
        baseUrl,
        messages: this.messages.slice(0, -1).filter(m => !m.isError),
        contextInfo: this.currentContext,
        screenshotBase64
      });

    } catch (err) {
      const friendly = "Service returned an error. Check Settings -> AI Provider.";
      this.messages[assistantIndex].content = friendly;
      this.messages[assistantIndex].isError = true;
      this.messages[assistantIndex].rawDetails = String(err);
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
              <pre class="err-pre"><code>${this.escapeHtml(String(err))}</code></pre>
            </details>
          </div>
        `;
        if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
          window.panelController.refreshIcons();
        }
      }
      this.renderMiniAvatar('confused');
      if (this.miniAvatarEl) this.miniAvatarEl.classList.remove('animating');
      window.panelController.notifyPet('pet:set-state', { state: 'confused', duration: 4500, priority: 5 });
      this.isGenerating = false;
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
                ${this.petRenderer.render(msg.isError ? 'confused' : 'happy', { size: 24, idPrefix: `msg-pet-${index}` })}
              </div>
            </div>
            <div class="msg-bubble-wrap">
              <div class="chat-bubble ai-glass-bubble">
                <div class="chat-bubble-content">${contentHtml}</div>
              </div>
              <span class="msg-timestamp muted-time">${timeStr}</span>
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
