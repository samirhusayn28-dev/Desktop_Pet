/**
 * Desktop Pet — Notes Tab Controller
 * Quick sticky notes with create/edit/delete/search/pinning/copy
 * Matches Chat glass design system, JetBrains Mono timestamps, and empty states
 */

class NotesTab {
  constructor() {
    this.container = document.getElementById('notes-container') || document.getElementById('notes-cards-list');
    this.searchInput = document.getElementById('notes-search-input');
    this.newNoteBtn = document.getElementById('btn-new-note');

    this.notes = [];
    this.init();
  }

  init() {
    this.loadNotes();
    this.setupEvents();
  }

  loadNotes() {
    if (!window.panelController) return;
    this.notes = window.panelController.store.get('notes') || [];
    this.render();
  }

  saveNotes() {
    if (!window.panelController) return;
    window.panelController.store.set('notes', this.notes);
  }

  setupEvents() {
    if (this.newNoteBtn) {
      this.newNoteBtn.addEventListener('click', () => this.createNote());
    }
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => this.render());
    }
  }

  createNote() {
    const newNote = {
      id: Date.now().toString(),
      title: 'New Note',
      content: 'Write something here...',
      pinned: false,
      updatedAt: new Date().toISOString()
    };
    this.notes.unshift(newNote);
    this.saveNotes();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();

    // Focus title of newly created note
    setTimeout(() => {
      const firstCard = this.container ? this.container.querySelector('.note-card-title') : null;
      if (firstCard) {
        firstCard.focus();
        document.execCommand('selectAll', false, null);
      }
    }, 50);
  }

  updateNote(id, title, content) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.title = title || 'Untitled Note';
      note.content = content || '';
      note.updatedAt = new Date().toISOString();
      this.saveNotes();
    }
  }

  togglePin(id) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.pinned = !note.pinned;
      // Sort pinned first
      this.notes.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
      this.saveNotes();
      this.render();
      if (window.soundEffects) window.soundEffects.playTap();
    }
  }

  copyNote(id) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      const text = `${note.title}\n\n${note.content}`;
      navigator.clipboard.writeText(text).then(() => {
        if (window.panelController) {
          window.panelController.notifyPet('pet:show-bubble', {
            badge: 'COPIED',
            text: 'Note copied to clipboard!',
            duration: 2500,
            emotion: 'wink'
          });
        }
      });
      if (window.soundEffects) window.soundEffects.playTap();
    }
  }

  deleteNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.saveNotes();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  formatDate(isoString) {
    try {
      const d = new Date(isoString);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch (e) {
      return '';
    }
  }

  render() {
    if (!this.container) return;
    const query = this.searchInput ? this.searchInput.value.toLowerCase().trim() : '';
    const filtered = this.notes.filter(n =>
      (n.title && n.title.toLowerCase().includes(query)) ||
      (n.content && n.content.toLowerCase().includes(query))
    );

    this.container.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tab-empty-state';
      empty.innerHTML = `
        <i data-lucide="file-text"></i>
        <span class="empty-title">No notes found</span>
        <span class="empty-subtitle">${query ? 'No notes matched your search query.' : 'Click "New" above to start jotting down thoughts!'}</span>
      `;
      this.container.appendChild(empty);
      if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
        window.panelController.refreshIcons();
      }
      return;
    }

    filtered.forEach(note => {
      const card = document.createElement('div');
      card.className = `note-card ${note.pinned ? 'pinned' : ''}`;
      card.innerHTML = `
        <div class="note-card-header">
          <div class="note-card-title" contenteditable="true" spellcheck="false">${note.title}</div>
          <span class="note-timestamp mono">${this.formatDate(note.updatedAt)}</span>
        </div>
        <div class="note-card-content" contenteditable="true" spellcheck="false">${note.content}</div>
        <div class="note-actions">
          <button class="note-btn note-copy-btn" title="Copy to clipboard"><i data-lucide="copy"></i></button>
          <button class="note-btn note-pin-btn ${note.pinned ? 'active' : ''}" title="${note.pinned ? 'Unpin note' : 'Pin to top'}">
            <i data-lucide="pin"></i>
          </button>
          <button class="note-btn note-delete-btn" title="Delete note"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      const titleEl = card.querySelector('.note-card-title');
      const contentEl = card.querySelector('.note-card-content');

      const saveCurrent = () => {
        this.updateNote(note.id, titleEl.textContent, contentEl.innerText);
      };

      titleEl.addEventListener('blur', saveCurrent);
      contentEl.addEventListener('blur', saveCurrent);

      card.querySelector('.note-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyNote(note.id);
      });

      card.querySelector('.note-pin-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePin(note.id);
      });

      card.querySelector('.note-delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteNote(note.id);
      });

      this.container.appendChild(card);
    });

    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }
}

window.NotesTab = NotesTab;
