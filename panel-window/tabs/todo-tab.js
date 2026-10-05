/**
 * Desktop Pet — To-Do Tab Controller
 * Replicates the "Working on it... 70%" progress card from the reference art
 * Supports: add, edit, complete, delete, reorder, progress bar, pet celebration reaction
 */

class TodoTab {
  constructor() {
    this.container = document.getElementById('todo-items-container') || document.getElementById('todo-items-list');
    this.inputField = document.getElementById('todo-input-field') || document.getElementById('todo-new-input');
    this.addBtn = document.getElementById('btn-todo-add') || document.getElementById('btn-add-todo');
    this.statusTextEl = document.getElementById('todo-status-text');
    this.percentTextEl = document.getElementById('todo-percent-text');
    this.progressRatioEl = document.getElementById('todo-progress-ratio');
    this.progressFillEl = document.getElementById('todo-progress-fill');

    this.todos = [];
    this.editingId = null;
    this.init();
  }

  init() {
    this.loadTodos();
    this.setupEvents();
    this.updateProgress();
  }

  loadTodos() {
    if (!window.panelController) return;
    this.todos = window.panelController.store.get('todos') || [];
    this.render();
  }

  saveTodos() {
    if (!window.panelController) return;
    window.panelController.store.set('todos', this.todos);
    this.updateProgress();
  }

  setupEvents() {
    if (this.addBtn) {
      this.addBtn.addEventListener('click', () => this.addTodo());
    }
    if (this.inputField) {
      this.inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.addTodo();
        }
      });
    }
  }

  addTodo(customText) {
    const text = (customText || (this.inputField ? this.inputField.value : '')).trim();
    if (!text) return;

    this.todos.push({
      id: Date.now().toString(),
      text,
      done: false
    });

    if (this.inputField) this.inputField.value = '';
    this.saveTodos();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  toggleTodo(id) {
    const item = this.todos.find(t => t.id === id);
    if (item) {
      item.done = !item.done;
      this.saveTodos();
      this.render();
      if (item.done) {
        // USER REQUEST: proud: all to-dos done (at least one to-do exists)
        if (this.todos.length > 0 && this.todos.every(t => t.done)) {
          if (window.app) {
            window.app.emit('todo:all-completed', { total: this.todos.length });
          }
          if (window.soundEffects) window.soundEffects.playHappy();
        } else {
          // USER REQUEST: wink: to-do completed
          if (window.app) {
            window.app.emit('todo:completed', { id: item.id });
          }
          if (window.soundEffects) window.soundEffects.playTap();
        }
      }
    }
  }

  startEdit(id, textEl) {
    const item = this.todos.find(t => t.id === id);
    if (!item) return;

    const currentText = item.text;
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'todo-inline-edit';
    editInput.value = currentText;

    const commit = () => {
      const val = editInput.value.trim();
      if (val && val !== currentText) {
        item.text = val;
        this.saveTodos();
      }
      this.render();
    };

    editInput.addEventListener('blur', commit);
    editInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        editInput.blur();
      } else if (e.key === 'Escape') {
        this.render();
      }
    });

    textEl.replaceWith(editInput);
    editInput.focus();
    editInput.select();
  }

  moveTodo(id, direction) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.todos.length) return;

    const [moved] = this.todos.splice(index, 1);
    this.todos.splice(newIndex, 0, moved);
    this.saveTodos();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  deleteTodo(id) {
    this.todos = this.todos.filter(t => t.id !== id);
    this.saveTodos();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  updateProgress() {
    const doneCount = this.todos.filter(t => t.done).length;
    const total = this.todos.length;
    const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    if (this.percentTextEl) this.percentTextEl.textContent = `${percent}%`;
    if (this.progressRatioEl) this.progressRatioEl.textContent = `${doneCount} / ${total} (${percent}%)`;
    if (this.progressFillEl) this.progressFillEl.style.width = `${percent}%`;

    if (this.statusTextEl) {
      if (total === 0) {
        this.statusTextEl.textContent = 'All clear!';
      } else if (percent === 100) {
        this.statusTextEl.textContent = 'All done!';
      } else if (percent >= 50) {
        this.statusTextEl.textContent = 'Working on it...';
      } else {
        this.statusTextEl.textContent = 'Getting started...';
      }
    }
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (this.todos.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tab-empty-state';
      empty.innerHTML = `
        <div class="empty-pet-face-wrap">
          <svg class="empty-pet-face-svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="6" width="40" height="36" rx="14" fill="var(--accent-soft)" stroke="var(--accent-border)" stroke-width="1.5"/>
            <circle cx="17" cy="22" r="3" fill="var(--accent)"/>
            <circle cx="31" cy="22" r="3" fill="var(--accent)"/>
            <path d="M20 28 Q24 32 28 28" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <span class="empty-title">All tasks completed</span>
        <span class="empty-subtitle">Add a new task above to stay productive!</span>
      `;
      this.container.appendChild(empty);
      this.updateProgress();
      if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
        window.panelController.refreshIcons();
      }
      return;
    }

    this.todos.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = `todo-item ${item.done ? 'done' : ''}`;
      el.innerHTML = `
        <input type="checkbox" class="todo-checkbox" ${item.done ? 'checked' : ''} title="Mark task done">
        <span class="todo-text" title="Double click to edit">${item.text}</span>
        <div class="todo-item-actions">
          <button class="todo-move-btn" data-action="up" title="Move Up" ${index === 0 ? 'disabled' : ''}>
            <i data-lucide="chevron-up"></i>
          </button>
          <button class="todo-move-btn" data-action="down" title="Move Down" ${index === this.todos.length - 1 ? 'disabled' : ''}>
            <i data-lucide="chevron-down"></i>
          </button>
          <button class="todo-edit-btn" title="Edit Task">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="todo-delete-btn" title="Delete Task">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `;

      el.querySelector('.todo-checkbox').addEventListener('change', () => {
        this.toggleTodo(item.id);
      });

      const textSpan = el.querySelector('.todo-text');
      textSpan.addEventListener('dblclick', () => {
        this.startEdit(item.id, textSpan);
      });

      el.querySelector('.todo-edit-btn').addEventListener('click', () => {
        this.startEdit(item.id, textSpan);
      });

      const upBtn = el.querySelector('[data-action="up"]');
      if (upBtn) {
        upBtn.addEventListener('click', () => this.moveTodo(item.id, -1));
      }

      const downBtn = el.querySelector('[data-action="down"]');
      if (downBtn) {
        downBtn.addEventListener('click', () => this.moveTodo(item.id, 1));
      }

      el.querySelector('.todo-delete-btn').addEventListener('click', () => {
        this.deleteTodo(item.id);
      });

      this.container.appendChild(el);
    });

    this.updateProgress();
    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }
}

window.TodoTab = TodoTab;
