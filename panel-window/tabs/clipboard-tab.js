/**
 * Desktop Pet — Clipboard History Tab
 * Tracks clipboard text entries, stores up to 30 items, supports one-click copy-back.
 * Completely standalone — zero system polling, zero systeminformation dependency.
 */

class ClipboardTab {
  constructor() {
    this.clipboardHistory = [];
    this.lastClipboardText = '';
    this.pollingInterval = null;

    // DOM refs
    this.listEl = document.getElementById('clipboard-history-list');
    this.clearBtn = document.getElementById('btn-clear-clipboard');
    this.searchInput = document.getElementById('clipboard-search-input');

    this.init();
  }

  init() {
    this.loadHistory();
    this.setupEvents();
    this.setupClipboardTracking();
  }

  loadHistory() {
    try {
      const saved = window.panelController && window.panelController.store.get('clipboard.history');
      this.clipboardHistory = Array.isArray(saved) ? saved : [];
    } catch {
      this.clipboardHistory = [];
    }
    this.render();
  }

  saveHistory() {
    try {
      if (window.panelController) {
        window.panelController.store.set('clipboard.history', this.clipboardHistory);
      }
    } catch {}
  }

  setupEvents() {
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.clipboardHistory = [];
        this.lastClipboardText = '';
        this.saveHistory();
        this.render();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.render());
    }
  }

  setupClipboardTracking() {
    // Check when the window gains focus
    window.addEventListener('focus', () => this.checkClipboard());

    // Also poll every 2s whenever the panel is active
    this.pollingInterval = setInterval(() => this.checkClipboard(), 2000);
  }

  async checkClipboard() {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.readText) return;
      const text = await navigator.clipboard.readText();
      const trimmed = (text || '').trim();
      if (!trimmed || trimmed === this.lastClipboardText || trimmed.length > 8000) return;

      this.lastClipboardText = trimmed;
      // Prepend, deduplicate, cap at 30
      this.clipboardHistory = [
        trimmed,
        ...this.clipboardHistory.filter(item => item !== trimmed)
      ].slice(0, 30);

      this.saveHistory();
      this.render();
    } catch {
      // Read permission denied or not focused — ignore silently
    }
  }

  getFilteredHistory() {
    if (!this.searchInput || !this.searchInput.value.trim()) {
      return this.clipboardHistory;
    }
    const q = this.searchInput.value.trim().toLowerCase();
    return this.clipboardHistory.filter(item => item.toLowerCase().includes(q));
  }

  render() {
    if (!this.listEl) return;

    const items = this.getFilteredHistory();

    if (items.length === 0) {
      const isSearching = this.searchInput && this.searchInput.value.trim();
      this.listEl.innerHTML = `
        <div class="clipboard-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
          <span>${isSearching ? 'No results match your search.' : 'Copy any text to track it here automatically.'}</span>
        </div>`;
      return;
    }

    this.listEl.innerHTML = items.map((item, idx) => {
      const sanitized = item
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      const preview = sanitized.length > 120 ? sanitized.slice(0, 120) + '…' : sanitized;
      const charCount = item.length;
      const isCode = /[{};=><()]/.test(item.slice(0, 100));
      return `
        <div class="clipboard-item${isCode ? ' is-code' : ''}" data-idx="${idx}" title="Click to copy">
          <div class="clip-preview">${preview}</div>
          <div class="clip-meta">
            <span class="clip-char-count">${charCount.toLocaleString()} chars</span>
            <button class="clip-copy-btn" data-idx="${idx}" title="Copy to clipboard">
              <i data-lucide="copy"></i>
            </button>
            <button class="clip-delete-btn" data-idx="${idx}" title="Remove">
              <i data-lucide="x"></i>
            </button>
          </div>
        </div>`;
    }).join('');

    // Click on item body = copy
    this.listEl.querySelectorAll('.clipboard-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.clip-copy-btn') || e.target.closest('.clip-delete-btn')) return;
        const idx = parseInt(el.dataset.idx, 10);
        this._copyItem(idx, el);
      });
    });

    // Copy button
    this.listEl.querySelectorAll('.clip-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        this._copyItem(idx, btn.closest('.clipboard-item'));
      });
    });

    // Delete button
    this.listEl.querySelectorAll('.clip-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        const filtered = this.getFilteredHistory();
        const textToRemove = filtered[idx];
        this.clipboardHistory = this.clipboardHistory.filter(i => i !== textToRemove);
        this.saveHistory();
        this.render();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }

  _copyItem(idx, el) {
    const filtered = this.getFilteredHistory();
    const text = filtered[idx];
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      if (el) {
        el.classList.add('copied');
        setTimeout(() => el && el.classList.remove('copied'), 1200);
      }
      if (window.soundEffects) window.soundEffects.playTap();
    }).catch(() => {});
  }
}

window.ClipboardTab = ClipboardTab;
