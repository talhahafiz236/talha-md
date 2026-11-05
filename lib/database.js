const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

class DatabaseManager {
  constructor() {
    this.settings = this.loadSettings();
    this.messageStore = new Map(); // Stores recent messages for Anti-Delete (max 3000)
    this.maxMessages = 3000;
  }

  loadSettings() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
        return Object.assign({}, config, JSON.parse(raw));
      }
    } catch (e) {
      console.error('[DB] Error loading settings:', e.message);
    }
    return Object.assign({}, config);
  }

  saveSettings() {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (e) {
      console.error('[DB] Error saving settings:', e.message);
    }
  }

  get(key) {
    return this.settings[key];
  }

  set(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    return value;
  }

  getAll() {
    return this.settings;
  }

  // --- Anti-Delete Message Buffer ---
  storeMessage(key, messageObj) {
    if (!key || !key.id) return;
    if (this.messageStore.size >= this.maxMessages) {
      // Evict oldest entry
      const firstKey = this.messageStore.keys().next().value;
      this.messageStore.delete(firstKey);
    }
    this.messageStore.set(key.id, {
      key,
      message: messageObj,
      timestamp: Date.now()
    });
  }

  getMessage(messageId) {
    return this.messageStore.get(messageId);
  }
}

module.exports = new DatabaseManager();
