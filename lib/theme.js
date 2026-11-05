const fs = require('fs');
const path = require('path');
const config = require('../config');
const fancy = require('./fancy');

const LOCAL_BANNER = path.join(__dirname, '..', 'public', 'banner.png');
let cachedBanner = null;
try {
  if (fs.existsSync(LOCAL_BANNER)) {
    cachedBanner = fs.readFileSync(LOCAL_BANNER);
  }
} catch (e) {}

/**
 * Premium WhatsApp Message Theme Engine for TALHA-MD
 * Provides high-tech Obsidian Spider-Hero formatting across all bot responses.
 */
class BotTheme {
  constructor() {
    this.botName = config.BOT_NAME;
    this.ownerName = config.OWNER_NAME;
  }

  getBannerBuffer() {
    if (cachedBanner) return cachedBanner;
    try {
      if (fs.existsSync(LOCAL_BANNER)) {
        cachedBanner = fs.readFileSync(LOCAL_BANNER);
        return cachedBanner;
      }
    } catch (e) {}
    return { url: config.MENU_IMAGE_URL };
  }

  getAdReply(title, body = 'TALHA-MD • 24/7 Ultra Fast Hero Bot') {
    return {
      externalAdReply: {
        title: title || `⚡ ${this.botName} ⚡`,
        body: body,
        mediaType: 1,
        thumbnailUrl: config.THUMB_URL,
        sourceUrl: config.SUPPORT_CHANNEL,
        renderLargerThumbnail: false
      }
    };
  }

  /**
   * Premium Bordered Card
   */
  card(title, lines = [], footer = '') {
    const header = `╭━━━〔 ⚡ *${title.toUpperCase()}* ⚡ 〕━━━╮`;
    const bodyLines = lines.map(line => `┃ ${line}`).join('\n');
    const bottom = `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
    let res = `${header}\n${bodyLines}\n${bottom}`;
    if (footer) {
      res += `\n\n_${footer}_`;
    }
    return res;
  }

  /**
   * Category Block for Menu
   */
  categoryBlock(emoji, title, commands = []) {
    let out = `╭───「 ${emoji} *${title.toUpperCase()}* 」───▸\n`;
    for (const cmd of commands) {
      out += `│ ⋄ \`${cmd.cmd}\` ➔ ${cmd.desc}\n`;
    }
    out += `╰──────────────────────────────▸`;
    return out;
  }

  /**
   * Action Result (Success / Info)
   */
  resultCard(emoji, title, details = [], note = '') {
    let out = `┌───「 ${emoji} *${title.toUpperCase()}* 」───\n`;
    for (const d of details) {
      out += `│ ${d}\n`;
    }
    out += `└──────────────────────────────`;
    if (note) {
      out += `\n\n_${note}_`;
    }
    return out;
  }

  /**
   * Error Notification
   */
  errorCard(cmdName, message) {
    return `┌───「 ⚠️ *COMMAND ALERT* 」───
│ ❌ *Command:* \`${cmdName}\`
│ 💬 *Reason:* ${message}
└──────────────────────────────
_Need help? Type .menu or ask Master Talha!_`;
  }
}

module.exports = new BotTheme();
