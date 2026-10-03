/**
 * Capture All Tabs and Real Transparency Proof for Desktop Pet
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
  await new Promise(r => setTimeout(r, 1000));

  try {
    // Configure pet name to 'Bolt' and active provider to Claude
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        window.panelController.store.set('settings.general.petName', 'Bolt');
        window.panelController.applyPetName('Bolt');
        window.panelController.store.set('settings.ai.activeProvider', 'anthropic');
        if (window.ThemeManager) window.ThemeManager.applyThemeToDocument(document, 'anthropic');
        const badge = document.getElementById('header-provider-badge');
        if (badge) badge.textContent = 'CLAUDE';

        window.panelController.store.set('settings.appearance.panelTransparency', 0.50);
        window.panelController.store.set('settings.appearance.panelBlur', 32);
        window.panelController.applyGlassmorphismSettings();
      }
    `);

    // 1. CAPTURE CHAT TAB
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
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
          const scroll = document.getElementById('chat-messages-container');
          if (scroll) scroll.scrollTop = 0;
        }
        window.panelController.switchTab('chat');
      }
    `);
    await new Promise(r => setTimeout(r, 600));
    const shotChat = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab1_chat.png'), shotChat.toPNG());
    console.log('CAPTURED: tab1_chat.png');

    // 2. CAPTURE TO-DO TAB
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        const sampleTodos = [
          { id: '1', text: 'Review pull request', done: true },
          { id: '2', text: 'Refactor audio service', done: true },
          { id: '3', text: 'Implement Lucide icon system', done: true },
          { id: '4', text: 'Test glassmorphic transparency', done: false },
          { id: '5', text: 'Build macOS installer DMG', done: false }
        ];
        window.panelController.store.set('todos', sampleTodos);
        if (window.panelController.todoTab) {
          window.panelController.todoTab.todos = sampleTodos;
          window.panelController.todoTab.render();
          window.panelController.todoTab.updateProgress();
        }
        window.panelController.switchTab('todo');
      }
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotTodo = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab2_todo.png'), shotTodo.toPNG());
    console.log('CAPTURED: tab2_todo.png');

    // 3. CAPTURE TIMER TAB
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        window.panelController.switchTab('timer');
      }
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotTimer = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab3_timer.png'), shotTimer.toPNG());
    console.log('CAPTURED: tab3_timer.png');

    // 4. CAPTURE NOTES TAB
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        if (window.panelController.notesTab) {
          window.panelController.notesTab.notes = [
            { id: '1', title: 'Architecture Ideas', content: 'Explore local vector embeddings with Ollama.\\nAdd sleek keyboard animations!', pinned: true },
            { id: '2', title: 'Desktop Pet Shortcuts', content: 'Click pet to toggle main assistant.\\nRight click for fast menu.', pinned: false }
          ];
          window.panelController.notesTab.render();
        }
        window.panelController.switchTab('notes');
      }
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotNotes = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab4_notes.png'), shotNotes.toPNG());
    console.log('CAPTURED: tab4_notes.png');

    // 5. CAPTURE REMINDERS TAB
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        if (window.panelController.remindersTab) {
          window.panelController.remindersTab.reminders = [
            { id: '1', title: 'Drink water and hydrate', time: '15:00', repeat: 'every-hour', enabled: true },
            { id: '2', title: 'Stand up & stretch posture', time: '16:00', repeat: 'daily', enabled: true },
            { id: '3', title: 'Daily engineering sync', time: '17:30', repeat: 'daily', enabled: true }
          ];
          window.panelController.remindersTab.render();
        }
        window.panelController.switchTab('reminders');
      }
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotReminders = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab5_reminders.png'), shotReminders.toPNG());
    console.log('CAPTURED: tab5_reminders.png');

    // 6. CAPTURE TOOLS TAB
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        window.panelController.switchTab('tools');
      }
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotTools = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab6_tools.png'), shotTools.toPNG());
    console.log('CAPTURED: tab6_tools.png');

    // 7. CAPTURE SETTINGS TAB - GENERAL & AI
    await panelWin.webContents.executeJavaScript(`
      if (window.panelController) {
        window.panelController.switchTab('settings');
        const pane = document.getElementById('pane-settings');
        if (pane) pane.scrollTop = 0;
      }
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotSettingsGen = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab7_settings_general.png'), shotSettingsGen.toPNG());
    console.log('CAPTURED: tab7_settings_general.png');

    // 8. CAPTURE SETTINGS TAB - APPEARANCE SLIDERS & LIVE PREVIEW
    await panelWin.webContents.executeJavaScript(`
      const pane = document.getElementById('pane-settings');
      if (pane) pane.scrollTop = 680;
    `);
    await new Promise(r => setTimeout(r, 500));
    const shotSettingsApp = await panelWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'tab7_settings_appearance.png'), shotSettingsApp.toPNG());
    console.log('CAPTURED: tab7_settings_appearance.png');

    // Close panel window
    panelWin.close();

    // 9. CAPTURE DESKTOP WALLPAPER TRANSPARENCY PROOF
    const stageWin = new BrowserWindow({
      width: 1140,
      height: 760,
      show: false,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    await stageWin.loadFile(path.join(__dirname, '..', 'stage_preview.html'));
    await new Promise(r => setTimeout(r, 1200));

    const shotProof = await stageWin.webContents.capturePage();
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'desktop_transparency_blur_proof.png'), shotProof.toPNG());
    console.log('CAPTURED: desktop_transparency_blur_proof.png');
    stageWin.close();

    console.log('ALL_CAPTURES_COMPLETED_SUCCESSFULLY');
    app.quit();
  } catch (err) {
    console.error('Error during capture:', err);
    app.quit();
  }
});
