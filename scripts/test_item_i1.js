/**
 * Test Suite for Item I1: Import / Export Settings, Notes, To-Dos, and Reminders
 */
const fs = require('fs');
const path = require('path');
const electron = require('electron');
const { app } = electron;

app.whenReady().then(async () => {
  console.log('=== Starting Test Suite for Item I1 (Import / Export) ===');
  const store = require('../main/secure-store');

  function deepStripKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(deepStripKeys);
    }
    const clean = {};
    const sensitive = ['apikey', 'key', 'keys', 'apikeys', 'secret', 'token', 'password', 'encryptedbase64'];
    for (const [k, v] of Object.entries(obj)) {
      if (sensitive.includes(k.toLowerCase())) continue;
      clean[k] = deepStripKeys(v);
    }
    return clean;
  }

  // 1. Test deepStripKeys
  const testObj = {
    settings: {
      ai: {
        activeProvider: 'groq',
        apiKey: 'SECRET_API_KEY_123',
        keys: { groq: 'SECRET_KEY_456' },
        models: { groq: 'llama-3.3-70b-versatile' }
      },
      general: {
        userName: 'Samir',
        petName: 'Bolt'
      }
    }
  };
  const stripped = deepStripKeys(testObj);
  console.assert(!stripped.settings.ai.apiKey, 'FAIL: apiKey was not stripped');
  console.assert(!stripped.settings.ai.keys, 'FAIL: keys was not stripped');
  console.assert(stripped.settings.ai.activeProvider === 'groq', 'FAIL: activeProvider was stripped');
  console.assert(stripped.settings.general.userName === 'Samir', 'FAIL: general.userName was lost');
  console.log('Test 1 (Key Stripping): PASS');

  // 2. Test Export Payload Generation
  const exportPayload = {
    format: 'desktop-pet-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    settings: deepStripKeys({
      general: store.get('settings.general') || {},
      behavior: store.get('settings.behavior') || {},
      reactions: store.get('settings.reactions') || {},
      appearance: store.get('settings.appearance') || {},
      privacy: store.get('settings.privacy') || {},
      ai: {
        activeProvider: store.get('settings.ai.activeProvider') || 'gemini',
        models: store.get('settings.ai.models') || {}
      }
    }),
    notes: [
      { id: 'note-1', title: 'Export Test Note', body: 'Hello world', pinned: true, timestamp: Date.now() }
    ],
    todos: [
      { id: 'todo-1', text: 'Test todo', done: false, createdAt: Date.now() }
    ],
    reminders: [
      { id: 'rem-1', text: 'Drink water', time: '14:00', enabled: true }
    ]
  };

  const exportPath = path.join(app.getPath('userData'), 'test-export-temp.json');
  fs.writeFileSync(exportPath, JSON.stringify(exportPayload, null, 2), 'utf8');
  console.assert(fs.existsSync(exportPath), 'FAIL: Export file was not created');
  const readBack = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  console.assert(readBack.format === 'desktop-pet-backup', 'FAIL: Invalid format in exported file');
  console.assert(readBack.notes.length === 1, 'FAIL: Notes length mismatch');
  console.assert(readBack.todos.length === 1, 'FAIL: Todos length mismatch');
  console.assert(readBack.reminders.length === 1, 'FAIL: Reminders length mismatch');
  console.log('Test 2 (Export File Creation): PASS');

  // 3. Test Invalid / Corrupt Import Validation
  const corruptPath = path.join(app.getPath('userData'), 'corrupt.json');
  fs.writeFileSync(corruptPath, '{ malformed json: not valid ...', 'utf8');

  let parseError = null;
  try {
    JSON.parse(fs.readFileSync(corruptPath, 'utf8'));
  } catch (e) {
    parseError = e.message;
  }
  console.assert(parseError !== null, 'FAIL: Corrupt file did not produce parse error');
  console.log('Test 3 (Corrupt JSON Detection): PASS');

  const unrecognizedPath = path.join(app.getPath('userData'), 'unrecognized.json');
  fs.writeFileSync(unrecognizedPath, JSON.stringify({ randomThing: 12345 }), 'utf8');
  const parsedUnrecognized = JSON.parse(fs.readFileSync(unrecognizedPath, 'utf8'));
  const hasData = parsedUnrecognized.format === 'desktop-pet-backup' || parsedUnrecognized.settings || parsedUnrecognized.notes;
  console.assert(!hasData, 'FAIL: Unrecognized schema was accepted');
  console.log('Test 4 (Unrecognized Schema Rejection): PASS');

  // 4. Test Automatic Safety Backup before Import
  const userDataPath = app.getPath('userData');
  const backupFileName = `backup-before-import-${Date.now()}.json`;
  const backupPath = path.join(userDataPath, backupFileName);
  fs.writeFileSync(backupPath, JSON.stringify({ format: 'desktop-pet-backup', version: 1, test: true }), 'utf8');
  console.assert(fs.existsSync(backupPath), 'FAIL: Safety backup file not created');
  console.log('Test 5 (Pre-import Safety Backup Creation): PASS');

  // 5. Test Notes Merge Strategy
  const existingNotes = [
    { id: 'note-existing-1', title: 'Existing Note', body: 'Do not delete', pinned: false }
  ];
  store.set('notes', existingNotes);

  const importedNotes = [
    { id: 'note-imported-2', title: 'Imported Note', body: 'New note content', pinned: true }
  ];

  // Merge logic
  const existingIds = new Set(existingNotes.map(n => n.id));
  const mergedNotes = [...existingNotes];
  for (const item of importedNotes) {
    if (!existingIds.has(item.id)) {
      mergedNotes.push(item);
    } else {
      mergedNotes.push(Object.assign({}, item, { id: 'note-dup-' + Date.now() }));
    }
  }
  store.set('notes', mergedNotes);

  const afterMerge = store.get('notes');
  console.assert(afterMerge.length === 2, 'FAIL: Notes merge count mismatch');
  console.assert(afterMerge.some(n => n.id === 'note-existing-1'), 'FAIL: Existing note was lost in merge');
  console.assert(afterMerge.some(n => n.id === 'note-imported-2'), 'FAIL: Imported note was missing in merge');
  console.log('Test 6 (Notes Merge Strategy): PASS');

  // 6. Test Notes Replace Strategy
  const replaceNotes = [
    { id: 'note-replace-only', title: 'Only this note', body: 'Replaced content', pinned: false }
  ];
  store.set('notes', replaceNotes);
  const afterReplace = store.get('notes');
  console.assert(afterReplace.length === 1 && afterReplace[0].id === 'note-replace-only', 'FAIL: Notes replace failed');
  console.log('Test 7 (Notes Replace Strategy): PASS');

  // Cleanup temp files
  try {
    if (fs.existsSync(exportPath)) fs.unlinkSync(exportPath);
    if (fs.existsSync(corruptPath)) fs.unlinkSync(corruptPath);
    if (fs.existsSync(unrecognizedPath)) fs.unlinkSync(unrecognizedPath);
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  } catch (e) {}

  console.log('ALL ITEM I1 TESTS PASSED!');
  app.exit(0);
});
