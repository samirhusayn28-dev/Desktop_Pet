/**
 * Visual Capture Script for Glassmorphic Desktop Pet Main Panel
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = '/Users/samirhusayn/.gemini/antigravity-ide/brain/ad1d272f-b7c0-4666-a011-842a6f84bf83';

app.whenReady().then(async () => {
  const panelWin = new BrowserWindow({
    width: 520,
    height: 680,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await panelWin.loadFile(path.join(__dirname, '..', 'panel-window', 'panel.html'));

  setTimeout(async () => {
    try {
      // 1. Setup Chat Tab state with clean user bubble and AI code block
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          window.panelController.store.set('settings.ai.activeProvider', 'default');
          if (window.ThemeManager) window.ThemeManager.applyThemeToDocument(document, 'default');
          document.getElementById('header-provider-badge').textContent = 'DEFAULT';
          
          const cleanHistory = [
            {
              role: 'user',
              content: 'Can you show me a clean debounce function in JavaScript?',
              timestamp: Date.now() - 45000
            },
            {
              role: 'assistant',
              content: 'Here is a clean debounce utility with custom delay:\\n\\n\`\`\`js\\n// Debounce helper for high-frequency events\\nconst debounce = (fn, delay = 250) => {\\n  let timerId = null;\\n  return (...args) => {\\n    clearTimeout(timerId);\\n    timerId = setTimeout(() => fn(...args), delay);\\n  };\\n};\\n\`\`\`\\n\\nWhat would you like to build or optimize next?',
              timestamp: Date.now() - 15000
            }
          ];
          
          window.panelController.store.set('chatHistory', cleanHistory);
          if (window.panelController.chatTab) {
            window.panelController.chatTab.messages = cleanHistory;
            window.panelController.chatTab.renderMessages();
            document.getElementById('chat-messages-container').scrollTop = 0;
          }
          window.panelController.switchTab('chat');
        }
      `);

      await new Promise(r => setTimeout(r, 600));

      // Capture Chat Tab
      const chatImg = await panelWin.webContents.capturePage();
      const chatPath = path.join(ARTIFACTS_DIR, 'glassmorphic_chat_tab.png');
      fs.writeFileSync(chatPath, chatImg.toPNG());
      console.log('CAPTURED_CHAT:', chatPath);

      // 2. Setup To-Do Tab matching reference art (70% progress, 5 tasks)
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          const sampleTodos = [
            { id: '1', text: 'Read docs', done: true },
            { id: '2', text: 'Write code', done: true },
            { id: '3', text: 'Test', done: true },
            { id: '4', text: 'Build', done: false },
            { id: '5', text: 'Get coffee ☕', done: false }
          ];
          window.panelController.store.set('todos', sampleTodos);
          if (window.panelController.todoTab) {
            window.panelController.todoTab.todos = sampleTodos;
            window.panelController.todoTab.render();
            window.panelController.todoTab.updateProgress();
            document.getElementById('todo-status-text').textContent = 'Working on it...';
            document.getElementById('todo-percent-text').textContent = '70%';
            document.getElementById('todo-progress-fill').style.width = '70%';
          }
          window.panelController.switchTab('todo');
        }
      `);
      await new Promise(r => setTimeout(r, 500));

      const todoImg = await panelWin.webContents.capturePage();
      const todoPath = path.join(ARTIFACTS_DIR, 'glassmorphic_todo_tab.png');
      fs.writeFileSync(todoPath, todoImg.toPNG());
      console.log('CAPTURED_TODO:', todoPath);

      // 3. Switch to Settings Tab
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          window.panelController.switchTab('settings');
          const pane = document.getElementById('pane-settings');
          if (pane) pane.scrollTop = 0;
        }
      `);
      await new Promise(r => setTimeout(r, 400));

      const settingsImg = await panelWin.webContents.capturePage();
      const settingsPath = path.join(ARTIFACTS_DIR, 'glassmorphic_settings_tab.png');
      fs.writeFileSync(settingsPath, settingsImg.toPNG());
      console.log('CAPTURED_SETTINGS:', settingsPath);

      // 4. Capture Timer Tab
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          window.panelController.switchTab('timer');
        }
      `);
      await new Promise(r => setTimeout(r, 400));
      const timerImg = await panelWin.webContents.capturePage();
      const timerPath = path.join(ARTIFACTS_DIR, 'glassmorphic_timer_tab.png');
      fs.writeFileSync(timerPath, timerImg.toPNG());
      console.log('CAPTURED_TIMER:', timerPath);

      // 5. Capture Notes Tab
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          window.panelController.switchTab('notes');
        }
      `);
      await new Promise(r => setTimeout(r, 400));
      const notesImg = await panelWin.webContents.capturePage();
      const notesPath = path.join(ARTIFACTS_DIR, 'glassmorphic_notes_tab.png');
      fs.writeFileSync(notesPath, notesImg.toPNG());
      console.log('CAPTURED_NOTES:', notesPath);

      // 6. Capture Tools Tab
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          window.panelController.switchTab('tools');
        }
      `);
      await new Promise(r => setTimeout(r, 400));
      const toolsImg = await panelWin.webContents.capturePage();
      const toolsPath = path.join(ARTIFACTS_DIR, 'glassmorphic_tools_tab.png');
      fs.writeFileSync(toolsPath, toolsImg.toPNG());
      console.log('CAPTURED_TOOLS:', toolsPath);

      // 7. Capture with Claude Terracotta Theme on Chat Tab
      await panelWin.webContents.executeJavaScript(`
        if (window.panelController) {
          window.panelController.store.set('settings.ai.activeProvider', 'anthropic');
          if (window.ThemeManager) window.ThemeManager.applyThemeToDocument(document, 'anthropic');
          document.getElementById('header-provider-badge').textContent = 'CLAUDE';
          window.panelController.switchTab('chat');
        }
      `);
      await new Promise(r => setTimeout(r, 400));

      const claudeImg = await panelWin.webContents.capturePage();
      const claudePath = path.join(ARTIFACTS_DIR, 'glassmorphic_claude_theme.png');
      fs.writeFileSync(claudePath, claudeImg.toPNG());
      console.log('CAPTURED_CLAUDE:', claudePath);

      app.quit();
    } catch (err) {
      console.error(err);
      app.quit();
    }
  }, 1000);
});
