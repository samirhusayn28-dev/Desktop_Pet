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

  addTodo() {
    if (!this.inputField) return;
    const text = this.inputField.value.trim();
    if (!text) return;

    this.todos.push({
      id: Date.now().toString(),
      text,
      done: false
    });

    this.inputField.value = '';
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
      if (item.done && window.soundEffects) {
        window.soundEffects.playTap();
      }

      // Check if all completed -> celebrate!
      if (this.todos.length > 0 && this.todos.every(t => t.done)) {
        window.panelController.notifyPet('pet:set-state', { state: 'proud', duration: 4500, priority: 4 });
        const name = (window.panelController.store.get('settings.general.userName') || '').trim();
        const msg = name ? `All tasks done, ${name}! You crushed it today!` : 'All tasks completed! Amazing work!';
        window.panelController.notifyPet('pet:show-bubble', { text: msg, duration: 4500, emotion: 'proud', badge: 'SPRINT COMPLETE' });
        if (window.soundEffects) window.soundEffects.playHappy();
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
        <i data-lucide="check-circle-2"></i>
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
