/**
 * Desktop Pet — To-Do Tab Controller
 * Replicates the "Working on it... 70%" progress card from the reference art
 */

class TodoTab {
  constructor() {
    this.container = document.getElementById('todo-items-container');
    this.inputField = document.getElementById('todo-input-field');
    this.addBtn = document.getElementById('btn-todo-add');
    this.statusTextEl = document.getElementById('todo-status-text');
    this.percentTextEl = document.getElementById('todo-percent-text');
    this.progressFillEl = document.getElementById('todo-progress-fill');

    this.todos = [];
    this.init();
  }

  init() {
    this.loadTodos();
    this.setupEvents();
    this.updateProgress();
  }

  loadTodos() {
    if (!window.panelController) return;
    this.todos = window.panelController.store.get('todos') || [
      { id: '1', text: 'Read docs', done: true },
      { id: '2', text: 'Write code', done: true },
      { id: '3', text: 'Test and debug', done: false },
      { id: '4', text: 'Build application', done: false },
      { id: '5', text: 'Take a break', done: false }
    ];
    this.render();
  }

  saveTodos() {
    if (!window.panelController) return;
    window.panelController.store.set('todos', this.todos);
    this.updateProgress();
  }

  setupEvents() {
    this.addBtn.addEventListener('click', () => this.addTodo());
    this.inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.addTodo();
      }
    });
  }

  addTodo() {
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
        window.panelController.notifyPet('pet:set-state', { state: 'celebrating', duration: 3500 });
        window.panelController.notifyPet('pet:show-bubble', { text: "All tasks completed! Amazing work!", duration: 4000 });
        if (window.soundEffects) window.soundEffects.playHappy();
      }
    }
  }

  deleteTodo(id) {
    this.todos = this.todos.filter(t => t.id !== id);
    this.saveTodos();
    this.render();
  }

  updateProgress() {
    if (this.todos.length === 0) {
      this.percentTextEl.textContent = '0%';
      this.progressFillEl.style.width = '0%';
      this.statusTextEl.textContent = 'All clear!';
      return;
    }

    const doneCount = this.todos.filter(t => t.done).length;
    const percent = Math.round((doneCount / this.todos.length) * 100);

    this.percentTextEl.textContent = `${percent}%`;
    this.progressFillEl.style.width = `${percent}%`;

    if (percent === 100) {
      this.statusTextEl.textContent = 'All done!';
    } else if (percent >= 50) {
      this.statusTextEl.textContent = 'Working on it...';
    } else {
      this.statusTextEl.textContent = 'Getting started...';
    }
  }

  render() {
    this.container.innerHTML = '';
    this.todos.forEach(item => {
      const el = document.createElement('div');
      el.className = `todo-item ${item.done ? 'done' : ''}`;
      el.innerHTML = `
        <input type="checkbox" class="todo-checkbox" ${item.done ? 'checked' : ''}>
        <span class="todo-text">${item.text}</span>
        <button class="todo-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
      `;

      el.querySelector('.todo-checkbox').addEventListener('change', () => {
        this.toggleTodo(item.id);
      });

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
