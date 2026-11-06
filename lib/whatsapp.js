const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const config = require('../config');
const db = require('./database');
const fancy = require('./fancy');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

async function getLiveWaVersion() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    return version;
  } catch (err) {
    try {
      const { version } = await fetchLatestWaWebVersion();
      return version;
    } catch (e) {
      return [2, 3000, 1043857760];
    }
  }
}

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected', 'qr_ready', 'pairing', 'connecting', 'connected'
    this.qrCodeDataUrl = null;
    this.pairingCode = null;
    this.isStarting = false;
    this.messageHandler = null;
  }

  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  isRegistered() {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    try {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      return Boolean(creds.registered && creds.me?.id);
    } catch (e) {
      return false;
    }
  }

  loadSessionFromEnv() {
    const sessionId = process.env.SESSION_ID;
    if (!sessionId) return;
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) return;

    try {
      let raw = sessionId.trim();
      if (raw.startsWith('TALHA-MD~')) raw = raw.replace('TALHA-MD~', '');
      else if (raw.startsWith('TALHA~')) raw = raw.replace('TALHA~', '');
      else if (raw.startsWith('SUHAIL-MD~')) raw = raw.replace('SUHAIL-MD~', '');
      else if (raw.startsWith('SUBZERO-MD~')) raw = raw.replace('SUBZERO-MD~', '');

      const decoded = Buffer.from(raw, 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      if (parsed.noiseKey || parsed.registrationId) {
        if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
        fs.writeFileSync(credsPath, JSON.stringify(parsed, null, 2));
        console.log('✅ [Session] Loaded credentials from SESSION_ID successfully!');
      }
    } catch (e) {
      console.error('❌ [Session] Error restoring from SESSION_ID:', e.message);
    }
  }

  getSessionId() {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (!fs.existsSync(credsPath)) return null;
    try {
      const creds = fs.readFileSync(credsPath, 'utf-8');
      const b64 = Buffer.from(creds).toString('base64');
      return `TALHA-MD~${b64}`;
    } catch (e) {
      return null;
    }
  }

  saveSessionToEnv(sessionId) {
    try {
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        if (envContent.includes('SESSION_ID=')) {
          envContent = envContent.replace(/SESSION_ID=.*/g, `SESSION_ID=${sessionId}`);
        } else {
          envContent = envContent.trim() + `\nSESSION_ID=${sessionId}\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf-8');
        process.env.SESSION_ID = sessionId;
        console.log('💾 [Session ID] Saved to .env with prefix TALHA-MD~');
      }
    } catch (e) {
      console.error('[Session ID] Error saving to .env:', e.message);
    }
  }

  async start() {
    this.loadSessionFromEnv();

    // Auto-clean incomplete/unregistered auth files that cause "Try again later" or "Logging in..."
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) {
      try {
        const c = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        if (!c.registered && !process.env.SESSION_ID) {
          console.log('⚠️ [WhatsApp] Found stale unregistered credentials. Purging for clean pairing...');
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        }
      } catch (e) {}
    }

    if (this.isStarting) {
      console.log('[WhatsApp] Start already in progress, skipping duplicate call.');
      return;
    }
    this.isStarting = true;
    this.status = 'connecting';

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const version = await getLiveWaVersion();

      if (this.sock) {
        try {
          this.sock.ev.removeAllListeners();
          this.sock.end();
        } catch (e) {}
        this.sock = null;
      }

      this.sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }))
        },
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        qrTimeout: 180000,
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        getMessage: async () => ({ conversation: 'Talha-MD' })
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
            this.status = 'qr_ready';
            console.log('📷 [WhatsApp] Live QR Code generated & ready to scan!');
          } catch (e) {
            console.error('[WhatsApp] QR generate error:', e.message);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isRestartRequired = statusCode === DisconnectReason.restartRequired || statusCode === 515;
          const registered = this.isRegistered();
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          this.status = 'disconnected';
          console.log(`[WhatsApp] Connection closed. Reason: ${lastDisconnect?.error?.message || 'unknown'} (Code: ${statusCode})`);

          if (isRestartRequired || registered) {
            console.log('🔄 [WhatsApp] Reconnecting registered bot in 2 seconds...');
            this.isStarting = false;
            setTimeout(() => this.start(), 2000);
          } else if (isLoggedOut && registered) {
            console.log('⚠️ [WhatsApp] Logged out from WhatsApp. Resetting session...');
            await this.resetAuth();
          } else {
            console.log('🔄 [WhatsApp] Refreshing QR / connection in 3 seconds...');
            this.isStarting = false;
            setTimeout(() => this.start(), 3000);
          }
        } else if (connection === 'open') {
          this.status = 'connected';
          this.pairingCode = null;
          this.qrCodeDataUrl = null;
          this.isStarting = false;
          console.log(`\n========================================`);
          console.log(`  ⚡ TALHA MD CONNECTED SUCCESSFULLY! ⚡  `);
          console.log(`  👑 Welcome Master Talha!               `);
          console.log(`========================================\n`);

          const sessionId = this.getSessionId();
          if (sessionId) {
            console.log(`🔑 [TALHA-MD Session ID Active]: ${sessionId.substring(0, 30)}...`);
            this.saveSessionToEnv(sessionId);
          }

          await this.sendWelcomeCard();
        }
      });

      // Call handling
      this.sock.ev.on('call', async (calls) => {
        if (!db.get('ANTI_CALL')) return;
        for (const call of calls) {
          if (call.status === 'offer') {
            try {
              await this.sock.rejectCall(call.id, call.from);
              await this.sock.sendMessage(call.from, {
                text: db.get('REJECT_CALL_MSG') || "*_Talha bhai busy hain, please call mat karein!_* 📵"
              });
            } catch (e) {}
          }
        }
      });

      // Message router
      this.sock.ev.on('messages.upsert', async (chatUpdate) => {
        if (this.messageHandler) {
          try {
            await this.messageHandler(this.sock, chatUpdate);
          } catch (err) {
            console.error('[Handler Error]:', err.message);
          }
        }
      });

      this.isStarting = false;
    } catch (err) {
      console.error('[WhatsApp] Start failed:', err.message);
      this.isStarting = false;
      this.status = 'disconnected';
    }
  }

  async requestPairingCode(phoneNumber) {
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNumber.startsWith('03') && cleanNumber.length === 11) {
      cleanNumber = '92' + cleanNumber.slice(1);
    }
    if (!cleanNumber || cleanNumber.length < 10) {
      throw new Error('Valid phone number with country code required (e.g. 923001234567)');
    }

    console.log(`\n======================================================`);
    console.log(`📱 [Pairing Request] Requesting code for: +${cleanNumber}`);
    console.log(`======================================================\n`);

    if (!this.sock || this.status === 'disconnected') {
      await this.start();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    try {
      const rawCode = await this.sock.requestPairingCode(cleanNumber);
      const formatted = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
      this.pairingCode = formatted;
      this.status = 'pairing';
      console.log(`\n🔑 [PAIRING CODE READY]: ${formatted}\n`);
      return formatted;
    } catch (err) {
      console.error('❌ [WhatsApp] Pairing code error:', err.message);
      if (err.message?.includes('429') || err.message?.includes('rate-overlimit')) {
        throw new Error('WhatsApp Rate Limit: Aap ne bohot baar codes request kiye hain. QR code scan karein ya 15 minute wait karein.');
      }
      throw err;
    }
  }

  async resetAuth() {
    this.status = 'disconnected';
    this.pairingCode = null;
    this.qrCodeDataUrl = null;
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end();
      } catch (e) {}
      this.sock = null;
    }
    if (fs.existsSync(AUTH_DIR)) {
      try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    try {
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        envContent = envContent.replace(/SESSION_ID=.*/g, 'SESSION_ID=');
        fs.writeFileSync(envPath, envContent, 'utf-8');
      }
      process.env.SESSION_ID = '';
    } catch (e) {}
    this.isStarting = false;
    console.log('🔄 [WhatsApp] Session reset successfully. Restarting QR & pairing engine...');
    setTimeout(() => this.start(), 1500);
    return true;
  }

  async sendWelcomeCard() {
    try {
      const theme = require('./theme');
      const ownerJid = (db.get('OWNER_NUMBER') || config.OWNER_NUMBER) + '@s.whatsapp.net';

      const lines = [
        `⚡ *Status:* \`Online & 24/7 Active\``,
        `👑 *Owner:* ${config.OWNER_NAME}`,
        `🕹️ *Prefix:* \`[ ${db.get('PREFIX') || config.PREFIX} ]\``,
        `✨ *Theme:* Obsidian Edition`,
        `🔒 *Mode:* \`${(db.get('MODE') || config.MODE).toUpperCase()}\``,
        `🛡️ *Anti-Delete:* \`${db.get('ANTI_DELETE') ? 'ENABLED ✅' : 'DISABLED ❌'}\``,
        `👁️ *Anti-ViewOnce:* \`${db.get('ANTI_VIEW_ONCE') ? 'ENABLED ✅' : 'DISABLED ❌'}\``,
        `🚀 *Engine:* Sub-20ms Ultra-Fast Dispatch`
      ];

      const caption = theme.card(`${config.BOT_NAME} • CONNECTED & READY`, lines, `Welcome Master Talha! Type ${db.get('PREFIX') || config.PREFIX}menu to begin! ⚡`);

      await this.sock.sendMessage(ownerJid, {
        image: theme.getBannerBuffer(),
        caption: caption,
        contextInfo: theme.getAdReply(`⚡ ${config.BOT_NAME} CONNECTED ⚡`, 'Next-Gen Multi-Device AI Assistant')
      });

      // Send permanent Session ID to owner for 24/7 Cloud persistence
      const sessionId = this.getSessionId();
      if (sessionId) {
        await this.sock.sendMessage(ownerJid, {
          text: `╭━━━〔 🔑 *TALHA-MD CLOUD SESSION KEY* 〕━━━╮\n\n\`\`\`${sessionId}\`\`\`\n\n📌 *24/7 Cloud Hosting Guide (Laptop Band Hone Par Bhi Chalay):*\n1. Render.com Dashboard par apne bot service mein jayein.\n2. Left menu se *Environment* par click karein.\n3. *Add Environment Variable* par click karein:\n   • Key: \`SESSION_ID\`\n   • Value: Upar di gayi poori key paste karein.\n4. *Save Changes* dabayein.\n\n👑 *Fayda:* Is ke baad laptop off ho, restart ho ya code update ho — bot bina pairing ke khud-ba-khud 24/7 online rahay ga! 🚀\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯`
        });
      }
    } catch (e) {
      console.log('[WhatsApp] Welcome card note:', e.message);
    }
  }
}

module.exports = new WhatsAppClient();
