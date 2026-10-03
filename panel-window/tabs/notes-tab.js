/**
 * Desktop Pet — Notes Tab Controller
 * Quick sticky notes with create/edit/delete/search/pinning
 */

class NotesTab {
  constructor() {
    this.container = document.getElementById('notes-container');
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
    this.notes = window.panelController.store.get('notes') || [
      { id: '1', title: 'Ideas', content: 'Explore vector embeddings and local LLMs with Ollama.\nAdd cute keyboard animations!', pinned: true, updatedAt: new Date().toISOString() },
      { id: '2', title: 'Desktop Pet Shortcut', content: 'Click pet to toggle main assistant.\nRight click for fast menu.', pinned: false, updatedAt: new Date().toISOString() }
    ];
    this.render();
  }

  saveNotes() {
    if (!window.panelController) return;
    window.panelController.store.set('notes', this.notes);
  }

  setupEvents() {
    this.newNoteBtn.addEventListener('click', () => this.createNote());
    this.searchInput.addEventListener('input', () => this.render());
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
  }

  updateNote(id, title, content) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.title = title;
      note.content = content;
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

  deleteNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.saveNotes();
    this.render();
  }

  render() {
    const query = this.searchInput.value.toLowerCase().trim();
    const filtered = this.notes.filter(n => 
      n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)
    );

    this.container.innerHTML = '';
    filtered.forEach(note => {
      const card = document.createElement('div');
      card.className = `note-card ${note.pinned ? 'pinned' : ''}`;
      card.innerHTML = `
        <div class="note-card-title" contenteditable="true" spellcheck="false">${note.title}</div>
        <div class="note-card-content" contenteditable="true" spellcheck="false">${note.content}</div>
        <div class="note-actions">
          <button class="note-btn note-pin-btn" title="${note.pinned ? 'Unpin' : 'Pin'}"><i data-lucide="pin"></i></button>
          <button class="note-btn note-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      const titleEl = card.querySelector('.note-card-title');
      const contentEl = card.querySelector('.note-card-content');

      titleEl.addEventListener('blur', () => {
        this.updateNote(note.id, titleEl.textContent, contentEl.innerText);
      });

      contentEl.addEventListener('blur', () => {
        this.updateNote(note.id, titleEl.textContent, contentEl.innerText);
      });

      card.querySelector('.note-pin-btn').addEventListener('click', () => {
        this.togglePin(note.id);
      });

      card.querySelector('.note-delete-btn').addEventListener('click', () => {
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
