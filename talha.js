// talha.js — TALHA MD Main Entry & WhatsApp Multi-Device Engine
const { File: BufferFile } = require('node:buffer');
global.File = BufferFile;

// ── TALHA MD System Verification ──────────────────────────────────────────
console.log('\x1b[36m⚡ TALHA MD Bot Initializing — Created for Talha Sheikh\x1b[0m');

// ── Suppress noisy libsignal / Baileys internal console output ─────────────
// libsignal calls console.error() directly on Bad MAC decryption failures.
// libsignal also console.log()s raw SessionEntry objects during retry floods.
// Neither is fatal — we filter them so only bot-level messages appear in logs.
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
    const msg = args.map(a => (typeof a === 'string' ? a : (a?.message || String(a)))).join(' ');
    if (/bad mac|failed to decrypt|session error/i.test(msg)) return;
    _origConsoleError(...args);
};
// Also filter stdout to catch libsignal session dumps that bypass console.log
// (libsignal may capture console.log by reference before our override)
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
let _stdoutBuf = '';
process.stdout.write = function (chunk, ...rest) {
    _stdoutBuf += (typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    let nl;
    while ((nl = _stdoutBuf.indexOf('\n')) !== -1) {
        const line = _stdoutBuf.slice(0, nl + 1);
        _stdoutBuf = _stdoutBuf.slice(nl + 1);
        if (/Closing session:|Opening session:|_chains|chainKey|chainType|messageKeys|pendingPreKey|registrationId|currentRatchet|ephemeralKeyPair|lastRemoteEphemeralKey|rootKey|indexInfo|baseKey|privKey|pubKey|remoteIdentityKey|previousCounter|signedKeyId|SessionEntry/.test(line)) continue;
        if (/^\s*closed:\s*-?\d|^\s*used:\s*\d|^\s*created:\s*\d/.test(line)) continue;
        if (/^\{"level":\d+,.*"msg":"/.test(line)) continue;
        _origStdoutWrite(line);
    }
    return true;
};

// ✅ TALHA MD Inc Property 2025
const baileys = require('@whiskeysockets/baileys');
const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    isJidGroup,
    isJidBroadcast,
    isJidStatusBroadcast,
    areJidsSameUser,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    generateMessageIDV2
} = baileys;

// Minimal in-memory message store (makeInMemoryStore was removed in gifted-baileys)
function makeInMemoryStore() {
    const messages = new Map(); // jid -> Map(id -> message)
    const MAX_PER_JID = 200;
    return {
        bind(ev) {
            ev.on('messages.upsert', ({ messages: msgs }) => {
                for (const m of msgs) {
                    if (!m.key?.id || !m.key?.remoteJid) continue;
                    const jid = m.key.remoteJid;
                    if (!messages.has(jid)) messages.set(jid, new Map());
                    const chat = messages.get(jid);
                    chat.set(m.key.id, m);
                    if (chat.size > MAX_PER_JID) {
                        const oldest = chat.keys().next().value;
                        chat.delete(oldest);
                    }
                }
            });
        },
        loadMessage(jid, id) {
            return messages.get(jid)?.get(id) || null;
        }
    };
}

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib'); // Added for session decompression
const express = require('express');
const P = require('pino');
const QRCode = require('qrcode');
const { handleMessages } = require('./handler');
const { handleStatusBroadcast } = require('./lib/statusManager');
const { isDuplicateMessage, rememberMessageIfContent } = require('./lib/message-gate');
const { trackUndecryptableMessage } = require('./lib/session-recovery');
const { initDatabase } = require('./lib/database');
const { initCallHandler } = require('./plugins/anticall');
const config = require('./config.js');

global.currentQrDataUrl = null;
global.currentPairingCode = null;
global.isWhatsAppConnected = false;

if (typeof global.antivvEnabled === 'undefined') global.antivvEnabled = config.ANTIVV !== false;
const store = makeInMemoryStore({ logger: P({ level: 'silent' }) });

// ── Reconnect state — module-level so it persists across connectToWhatsApp() calls ──
let _reconnectCount   = 0;   // how many consecutive failed reconnect attempts
let _isReconnecting   = false; // guard: only one reconnect in flight at a time
let _keepAliveTimer   = null;  // handle for the keep-alive presence interval

function _scheduleReconnect(fn) {
    if (_isReconnecting) {
        logMessage('DEBUG', '[Reconnect] Skipped — reconnect already in progress');
        return;
    }
    _isReconnecting = true;
    _reconnectCount++;

    let isRegistered = false;
    try {
        if (fs.existsSync(credsPath)) {
            isRegistered = Boolean(JSON.parse(fs.readFileSync(credsPath, 'utf8'))?.registered);
        }
    } catch (_) {}

    // When NOT registered (pairing mode), always reconnect in 3s so user is never blocked
    const delay = isRegistered
        ? Math.min(3000 * Math.pow(2, _reconnectCount - 1), 5 * 60 * 1000)
        : 3000;

    logMessage('INFO', `[Reconnect] Attempt #${_reconnectCount} in ${Math.round(delay / 1000)}s (registered: ${isRegistered})`);
    setTimeout(() => {
        _isReconnecting = false;
        fn();
    }, delay);
}

function _resetReconnect() {
    _reconnectCount = 0;
    _isReconnecting = false;
}

const prefix = config.PREFIX || '.';
const tempDir = path.join(os.tmpdir(), 'talha-cache');
const port = Number(process.env.PORT) || 25680;
const pluginsDir = path.join(__dirname, 'plugins');

// ✅ Session paths
const sessionDir = path.join(__dirname, 'session');
const credsPath = path.join(sessionDir, 'creds.json');

// ✅ Create session directory if not exists
function createDirIfNotExist(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
createDirIfNotExist(sessionDir);

// ✅ Load session from compressed base64 (or reuse existing session on disk)
async function loadSession() {
    try {
        const sid = (config.SESSION_ID || '').trim();
        const hasTilde = sid.includes('~');

        if (sid) {
            // Only restore from SESSION_ID if creds.json is missing.
            // Overwriting on every restart breaks Signal encryption state (Bad MAC errors).
            if (!fs.existsSync(credsPath)) {
                let b64data = sid;
                if (sid.includes('~')) {
                    const parts = sid.split('~');
                    b64data = parts.slice(1).join('~');
                }
                const cleanB64 = b64data.replace('...', '').replace(/\s+/g, '').trim();
                let decompressedData = null;
                try {
                    const compressedData = Buffer.from(cleanB64, 'base64');
                    decompressedData = zlib.gunzipSync(compressedData).toString('utf8');
                } catch {
                    // Try direct base64 decode if not gzipped
                    decompressedData = Buffer.from(cleanB64, 'base64').toString('utf8');
                }
                if (decompressedData) {
                    JSON.parse(decompressedData); // validate JSON before writing
                    fs.writeFileSync(credsPath, decompressedData, "utf8");
                    logMessage('SUCCESS', "✅ NEW TALHA-MD SESSION LOADED SUCCESSFULLY");
                }
            } else {
                logMessage('INFO', "📂 Using existing session from disk");
            }
        } else if (fs.existsSync(credsPath)) {
            // No SESSION_ID — reuse the session already on disk (Replit / local mode)
            logMessage('INFO', "📂 Using existing session from disk");

        } else {
            // No session at all — Baileys will generate a QR code to scan
            logMessage('WARN', "⚠️ No session found — scan the QR code to connect");
        }

    } catch (e) {
        logMessage('ERROR', `Session Error: ${e.message}`);
        logMessage('WARN', "⚠️ Session load failed — attempting QR fallback");
    }
}

// ✅ Message Cache for Anti-Delete
const messageCache = new Map();

// ✅ Message Logger Setup
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function getLogFileName() {
    const date = new Date();
    return `messages-${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.log`;
}

function logMessage(type, message) {
    if (!config.DEBUG && type === 'DEBUG') return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] ${message}\n`;
    console.log(logEntry.trim());
    const logFile = path.join(logDir, getLogFileName());
    fs.appendFile(logFile, logEntry, () => {});
}

const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: process.env.NEWSLETTER_JID || config.NEWSLETTER_JID || '120363431246808172@newsletter',
        newsletterName: process.env.NEWSLETTER_NAME || config.NEWSLETTER_NAME || '⚡ TALHA-MD OFFICIAL ⚡',
        serverMessageId: 100
    }
};

// ✅ Safe Get User JID
function safeGetUserJid(sock) {
    try {
        return sock.user?.id || null;
    } catch {
        return null;
    }
}

// ✅ Ensure Temp Directory Exists
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
setInterval(() => {
    try {
        fs.readdirSync(tempDir).forEach(file => fs.unlinkSync(path.join(tempDir, file)));
    } catch (e) { /* ignore */ }
}, 5 * 60 * 1000);

// ✅ Load Plugins
let plugins = new Map();
function loadPlugins() {
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir);
    const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));
    plugins.clear();
    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(pluginsDir, file))];
            const plugin = require(path.join(pluginsDir, file));
            plugins.set(file.replace('.js', ''), plugin);
        } catch (err) {
            logMessage('ERROR', `Failed loading plugin ${file}: ${err.message}`);
        }
    }
    let totalCmds = 0;
    for (const [, p] of plugins) {
        const mods = Array.isArray(p) ? p : [p];
        for (const m of mods) {
            if (m && m.commands) totalCmds += m.commands.length;
        }
    }
    logMessage('INFO', `✅ Loaded ${plugins.size} plugin files (${totalCmds} commands)`);
}
loadPlugins();

// ✅ Utility helpers
async function downloadAsBuffer(messageObj, typeHint = 'file') {
    try {
        const stream = await downloadContentFromMessage(messageObj, typeHint);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        return buffer;
    } catch (err) {
        logMessage('ERROR', `downloadAsBuffer error: ${err.message}`);
        return null;
    }
}

function isBotMentioned(message, botJid) {
    try {
        const extended = message?.extendedTextMessage;
        if (!extended) return false;
        const mentions = extended.contextInfo?.mentionedJid || [];
        return mentions.includes(botJid);
    } catch (e) {
        return false;
    }
}

// ✅ Generate Config Table
function generateConfigTable() {
    const configs = [
        { name: 'MODE', value: config.MODE },
        { name: 'ANTIDELETE_GROUP', value: config.ANTIDELETE_GROUP },
        { name: 'ANTIDELETE_PRIVATE', value: config.ANTIDELETE_PRIVATE },
        { name: 'AUTO_STATUS_SEEN', value: config.AUTO_STATUS_SEEN },
        { name: 'AUTO_STATUS_REACT', value: config.AUTO_STATUS_REACT },
        { name: 'AUTO_STATUS_REPLY', value: config.AUTO_STATUS_REPLY },
        { name: 'AUTO_REACT_NEWSLETTER', value: config.AUTO_REACT_NEWSLETTER },
        { name: 'ANTILINK', value: config.ANTILINK },
        { name: 'ALWAYS_ONLINE', value: config.ALWAYS_ONLINE },
        { name: 'GROUP_COMMANDS', value: config.GROUP_COMMANDS }
    ];

    let table = '╔══════════════════════════╦═══════════╗\n';
    table += '║        Config Name       ║   Value   ║\n';
    table += '╠══════════════════════════╬═══════════╣\n';

    for (const c of configs) {
        const paddedName = c.name.padEnd(24, ' ');
        const paddedValue = String(c.value).padEnd(9, ' ');
        table += `║ ${paddedName} ║ ${paddedValue} ║\n`;
    }

    table += '╚══════════════════════════╩═══════════╝';
    return table;
}

// ✅ Fancy Bio Generator
function generateFancyBio() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-PK', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Karachi'
    });

    const timeStr = now.toLocaleTimeString('en-PK', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Karachi'
    });

    const bios = [
        `✨ ${config.BOT_NAME} ✦ Online ✦ ${dateStr} ✦`,
        `⚡ TALHA MD Active ✦ ${timeStr} ✦ ${dateStr} ✦`,
        `💫 ${config.BOT_NAME} Operational ✦ ${dateStr} ✦`,
        `🚀 TALHA MD Live ✦ ${dateStr} ✦ ${timeStr} ✦`,
        `🌟 ${config.BOT_NAME} Running ✦ ${dateStr} ✦`
    ];

    return bios[Math.floor(Math.random() * bios.length)];
}

// ✅ Welcome Message
async function sendWelcomeMessage(sock) {
    const now = new Date().toLocaleString('en-PK', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi'
    });

    // Count total commands across all plugins
    let totalCmds = 0;
    for (const [, p] of plugins) {
        const ms = Array.isArray(p) ? p : [p];
        for (const m of ms) { if (m && m.commands) totalCmds += m.commands.length; }
    }

    const caption = [
        `⚡ *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗩𝟮.𝟬 𝗜𝗦 𝗢𝗡𝗟𝗜𝗡𝗘* ⚡`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `👑 *Owner:* ${config.OWNER_NAME || 'Talha Sheikh'}`,
        `🤖 *Status:* Connected & Ready To Serve`,
        `🧠 *AI Engine:* Neural Core Active`,
        `📦 *Features:* ${plugins.size} Plugins • ${totalCmds} Commands`,
        `🌐 *Mode:* ${(config.MODE || 'public').toUpperCase()}`,
        `⏱️ *Time:* ${now} PKT`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `💡 Type \`${prefix}menu\` for the stylish command menu!`,
        `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
    ].join('\n');

    // Load bot welcome image ("Hello! I'm Talha MD")
    const iconPath = path.join(__dirname, 'assets', 'talha_md_welcome.jpg');
    const iconBuffer = fs.existsSync(iconPath) ? fs.readFileSync(iconPath) : null;

    try {
        const ownerJid = `${config.OWNER_NUMBER.replace(/\D/g, '')}@s.whatsapp.net`;

        if (iconBuffer) {
            try {
                await sock.sendMessage(ownerJid, {
                    image:       iconBuffer,
                    caption,
                    mimetype:    'image/jpeg'
                });
            } catch {
                await sock.sendMessage(ownerJid, { image: { url: 'https://files.catbox.moe/ncgbn5.jpg' }, caption });
            }
        } else {
            await sock.sendMessage(ownerJid, { image: { url: 'https://files.catbox.moe/ncgbn5.jpg' }, caption });
        }
        logMessage('SUCCESS', 'Welcome message sent to owner.');

        // ── Auto-generate & deliver permanent SESSION_ID to owner DM ──
        try {
            if (fs.existsSync(credsPath)) {
                const credsRaw = fs.readFileSync(credsPath);
                const sid = 'TALHA-MD~' + Buffer.from(credsRaw).toString('base64');
                const sidMessage = [
                    `⚡ *TALHA-MD PERMANENT SESSION ID* ⚡`,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                    `Aapka bot WhatsApp ke sath 100% connect ho chuka hai!`,
                    ``,
                    `Yeh aapka permanent *SESSION_ID* hai jo aapko Render / Koyeb / VPS par 24/7 run karne ke liye use karna hai (taake laptop band karne ke baad bhi bot chalta rahe):`,
                    ``,
                    `\`\`\`${sid}\`\`\``,
                    ``,
                    `📌 *24/7 Cloud Hosting Instructions:*`,
                    `1. Render ya Koyeb par jayein`,
                    `2. Environment Variable add karein:`,
                    `   • Key: \`SESSION_ID\``,
                    `   • Value: (upar wala code copy karein)`,
                    `3. Deploy karein — bot 24/7 cloud par live ho jayega!`,
                    ``,
                    `⚠️ *Secret:* Yeh code kisi ke sath share na karein!`,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`
                ].join('\n');
                await sock.sendMessage(ownerJid, { text: sidMessage });
                logMessage('SUCCESS', 'Permanent SESSION_ID delivered to owner DM.');
            }
        } catch (sidErr) {
            logMessage('WARN', `SESSION_ID delivery note: ${sidErr.message}`);
        }
    } catch (e) {
        logMessage('WARN', `Welcome message failed: ${e.message}`);
    }

}

// ✅ Update Profile Status
async function updateProfileStatus(sock) {
    if (config.AUTO_BIO === false) {
        logMessage('INFO', 'Automatic bio updates are disabled.');
        return;
    }
    try {
        const bio = generateFancyBio();
        await sock.updateProfileStatus(bio);
        logMessage('SUCCESS', `✅ Bio updated: ${bio}`);
    } catch (err) {
        if (/rate.?overlimit|rate.?limit|too.?many/i.test(err.message || '')) {
            logMessage('WARN', `Bio update skipped — rate limited, will retry on next connect`);
        } else {
            logMessage('WARN', `Bio update failed: ${err.message}`);
        }
    }
}

// ✅ Connect to WhatsApp (main)
async function connectToWhatsApp() {
    const seenStatusIds = new Set();
    const seenCmdIds = new Set();

    if (global._dedupSweepTimer) clearInterval(global._dedupSweepTimer);
    global._dedupSweepTimer = setInterval(() => {
        if (seenCmdIds.size > 5000) seenCmdIds.clear();
        if (seenStatusIds.size > 5000) seenStatusIds.clear();
    }, 10 * 60 * 1000);

    // Ensure session directory exists and preserve credentials during pairing
    createDirIfNotExist(sessionDir);

    // Use the session directory for multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // gifted-baileys' version fetch URL is broken (404) and adds ~12s delay on startup.
    // Fetch directly from the upstream WhiskeySockets/Baileys repo with a fast timeout; fall back to pinned version.
    let version = [2, 3000, 1035194821];
    try {
        const _https = require('https');
        await new Promise((resolve) => {
            _https.get('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json', (r) => {
                let d = ''; r.on('data', c => d += c);
                r.on('end', () => {
                    try { const parsed = JSON.parse(d); if (Array.isArray(parsed.version)) { version = parsed.version; logMessage('INFO', `WA version (upstream): ${version.join('.')}`); } } catch {}
                    resolve();
                });
            }).on('error', () => resolve()).setTimeout(4000, function() { this.destroy(); resolve(); });
        });
    } catch { /* keep pinned version */ }

    // Safely terminate and clean up any existing socket to prevent "Stream Errored (conflict)"
    if (global.currentSock) {
        try {
            global.currentSock.ev.removeAllListeners();
            global.currentSock.end(new Error('Reconnecting to WhatsApp'));
        } catch (_) {}
        global.currentSock = null;
    }

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }))
        },
        version,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        qrTimeout: 180000,
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        getMessage: async (key) => {
            const cacheKey = `${key.remoteJid}-${key.id}`;
            const cached = messageCache.get(cacheKey);
            if (cached?.message) return cached.message;
            const stored = store.loadMessage(key.remoteJid, key.id);
            return stored?.message || undefined;
        }
    });

    global.currentSock = sock;

    // bind the store so store.loadMessage works
    try {
        store.bind(sock.ev);
    } catch (e) {
        logMessage('WARN', `store.bind failed: ${e.message}`);
    }

    // Direct Pairing Code capability
    const pairingTarget = (process.env.PAIRING_NUMBER || config.PAIRING_NUMBER || config.OWNER_NUMBER || '').replace(/\D/g, '');
    global.pairingTarget = pairingTarget;

    // On fully LID-migrated accounts the contact id IS the LID — no phone JID is provided.
    // We keep a map in case partial data arrives via messaging-history.set on other accounts.
    if (!global.lidJidMap) global.lidJidMap = new Map();
    if (!global.lidPhoneCache) global.lidPhoneCache = new Map();
    if (!global.pushNameCache) global.pushNameCache = new Map();
    let _globalLidMapping;
    try { ({ globalLidMapping: _globalLidMapping } = require('@whiskeysockets/baileys/lib/Utils/lid-mapping')); } catch {}

    const CACHE_DIR_EARLY = path.join(__dirname, 'data');
    const LID_CACHE_EARLY = path.join(CACHE_DIR_EARLY, 'lid-phone-cache.json');
    const NAME_CACHE_EARLY = path.join(CACHE_DIR_EARLY, 'push-names.json');
    try {
        if (fs.existsSync(LID_CACHE_EARLY)) {
            const raw = JSON.parse(fs.readFileSync(LID_CACHE_EARLY, 'utf8'));
            for (const [lid, phone] of Object.entries(raw)) {
                global.lidPhoneCache.set(lid, phone);
                if (_globalLidMapping) _globalLidMapping.set(lid.endsWith('@lid') ? lid : lid + '@lid', phone.endsWith('@s.whatsapp.net') ? phone : phone + '@s.whatsapp.net');
            }
            logMessage('INFO', `[Cache] Early-loaded ${Object.keys(raw).length} LID→phone mappings`);
        }
    } catch {}
    try {
        if (fs.existsSync(NAME_CACHE_EARLY)) {
            const raw = JSON.parse(fs.readFileSync(NAME_CACHE_EARLY, 'utf8'));
            for (const [jid, name] of Object.entries(raw)) global.pushNameCache.set(jid, name);
            logMessage('INFO', `[Cache] Early-loaded ${Object.keys(raw).length} push names`);
        }
    } catch {}

    function atomicWriteJson(filePath, data) {
        const tmp = filePath + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(data));
        fs.renameSync(tmp, filePath);
    }

    function flushCachesToDisk() {
        try {
            fs.mkdirSync(CACHE_DIR_EARLY, { recursive: true });
            const lidObj = {}; global.lidPhoneCache.forEach((v, k) => { lidObj[k] = v; });
            atomicWriteJson(LID_CACHE_EARLY, lidObj);
            const nameObj = {}; global.pushNameCache.forEach((v, k) => { nameObj[k] = v; });
            atomicWriteJson(NAME_CACHE_EARLY, nameObj);
        } catch (e) { logMessage('WARN', `[Cache] flush error: ${e.message}`); }
    }

    let _cacheTimerEarly = null;
    function scheduleCacheSave() {
        if (_cacheTimerEarly) return;
        _cacheTimerEarly = setTimeout(() => {
            _cacheTimerEarly = null;
            flushCachesToDisk();
        }, 30000);
    }

    if (!global._signalHandlersRegistered) {
        global._signalHandlersRegistered = true;
        process.once('SIGINT', () => { flushCachesToDisk(); process.exit(0); });
        process.once('SIGTERM', () => { flushCachesToDisk(); process.exit(0); });
    }

    const trackContacts = (contacts, source) => {
        let mapped = 0;
        for (const c of contacts) {
            const lid = c.lid;
            const jid = c.id;
            if (lid && jid && lid.endsWith('@lid') && jid.includes('@s.whatsapp.net')) {
                global.lidJidMap.set(lid, jid);
                if (_globalLidMapping) _globalLidMapping.set(lid, jid);
                const normLid = lid.split(':')[0].split('@')[0];
                const phone = jid.split('@')[0].replace(/:/g, '').replace(/\D/g, '');
                if (normLid && phone && phone.length >= 7) {
                    global.lidPhoneCache.set(normLid, phone);
                    global.lidPhoneCache.set(normLid + '@lid', phone);
                    global.lidPhoneCache.set(lid, phone);
                }
                mapped++;
            }
            if (c.name || c.notify || c.pushName || c.verifiedName) {
                const name = c.name || c.notify || c.pushName || c.verifiedName;
                if (jid) { global.pushNameCache.set(jid, name); }
                if (lid) { global.pushNameCache.set(lid, name); const n = lid.split(':')[0].split('@')[0] + '@lid'; if (n !== lid) global.pushNameCache.set(n, name); }
            }
        }
        if (contacts.length > 0 && mapped > 0) {
            logMessage('INFO', `[LID] ${source}: mapped ${mapped}/${contacts.length} LID→JID (total: ${global.lidJidMap.size})`);
            scheduleCacheSave();
        }
    };
    sock.ev.on('contacts.upsert', (c) => trackContacts(c, 'contacts.upsert'));
    sock.ev.on('contacts.update', (c) => trackContacts(c, 'contacts.update'));
    sock.ev.on('messaging-history.set', ({ contacts }) => { if (contacts?.length) trackContacts(contacts, 'messaging-history.set'); });

    // keep handler's setup in place if your handler requires connection hooks
    try {
        const { setupConnectionHandlers } = require('./handler');
        if (typeof setupConnectionHandlers === 'function') setupConnectionHandlers(sock);
    } catch (e) {
        logMessage('DEBUG', 'No setupConnectionHandlers exported from handler (ok).');
    }

    // connection update
    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;

        // QR code received — render in terminal & cache for web view
        if (qr) {
            logMessage('INFO', '📱 QR code ready — scan it in WhatsApp > Linked Devices:');
            try {
                QRCode.toDataURL(qr, { margin: 2, scale: 6 }, (err, url) => {
                    if (!err && url) global.currentQrDataUrl = url;
                });
                const qrFilePath = path.join(__dirname, 'assets', 'current_qr.png');
                QRCode.toFile(qrFilePath, qr, { margin: 2, scale: 6 }).catch(() => {});
            } catch (_) {}
            try {
                const qrcodeTerminal = require('qrcode-terminal');
                qrcodeTerminal.generate(qr, { small: true });
            } catch (e) {
                console.log(qr);
            }

            // Generate pairing code when QR is emitted (socket is verified open and ready)
            if (!sock.authState.creds.registered && pairingTarget && !global.hasRequestedPairing) {
                global.hasRequestedPairing = true;
                setTimeout(async () => {
                    if (global.isWhatsAppConnected) return;
                    try {
                        const code = await sock.requestPairingCode(pairingTarget);
                        const prettyCode = code?.match(/.{1,4}/g)?.join('-') || code;
                        global.currentPairingCode = prettyCode;
                        console.log(`\n======================================================`);
                        console.log(`  ⚡ TALHA-MD LIVE PAIRING CODE FOR +${pairingTarget}:`);
                        console.log(`  👉  ${prettyCode}  👈`);
                        console.log(`  Enter this 8-digit code in WhatsApp > Linked Devices`);
                        console.log(`  🌐 Web QR/Pairing View: http://localhost:${port}/qr`);
                        console.log(`======================================================\n`);
                    } catch (err) {
                        logMessage('WARN', `Pairing code generation notice: ${err.message}`);
                    }
                }, 1000);
            }
        }

        if (connection === 'close') {
            global.isWhatsAppConnected = false;
            // Stop the keep-alive ping for this socket — a new one starts on reconnect
            if (_keepAliveTimer) { clearInterval(_keepAliveTimer); _keepAliveTimer = null; }

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason     = lastDisconnect?.error?.message || '';
            const isConflict = statusCode === 440 || /conflict|replaced/i.test(reason);
            logMessage('WARN', `Connection closed: ${statusCode || 'Unknown'}${reason ? ` (${reason})` : ''}`);

            if (isConflict) {
                // Another instance or leftover socket connection collided — DO NOT delete session files!
                logMessage('WARN', `⚠️ Session conflict detected (${statusCode || 'conflict'}) — releasing old socket and reconnecting in 5s...`);
                _resetReconnect();
                setTimeout(() => connectToWhatsApp(), 5000);
            } else if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
                logMessage('INFO', '⚡ WhatsApp stream restart required (Pairing handshake) — reconnecting immediately in 1s...');
                _resetReconnect();
                setTimeout(() => connectToWhatsApp(), 1000);
            } else if (statusCode === DisconnectReason.loggedOut) {
                global.hasRequestedPairing = false;
                global.currentPairingCode = null;

                // Check if this is a genuine manual logout from WhatsApp mobile app
                const isExplicitLogout = /intentional|logged\s*out|user_initiated/i.test(reason);

                if (sock.authState?.creds?.registered && isExplicitLogout) {
                    logMessage('WARN', '⚠️ Session explicitly logged out by user. Clearing registered session...');
                    _resetReconnect();
                    try {
                        const files = fs.readdirSync(sessionDir);
                        for (const f of files) {
                            try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
                        }
                        logMessage('INFO', '🗑️ Old session files cleared.');
                    } catch (e) {
                        logMessage('WARN', `Could not clear session: ${e.message}`);
                    }
                    _scheduleReconnect(() => connectToWhatsApp());
                } else if (sock.authState?.creds?.registered) {
                    // Registered session encountered a transient connection reset — NEVER WIPE!
                    logMessage('INFO', `⚡ Registered session reconnecting after transient ${statusCode} (${reason || 'bounce'}) — preserving keys...`);
                    _resetReconnect();
                    setTimeout(() => connectToWhatsApp(), 2000);
                } else {
                    // Not registered yet — clean up stale pairing attempt
                    logMessage('INFO', 'Pairing session reset — clearing stale keys for fresh attempt...');
                    try {
                        const files = fs.readdirSync(sessionDir);
                        for (const f of files) {
                            try { fs.unlinkSync(path.join(sessionDir, f)); } catch {}
                        }
                    } catch (_) {}
                    _scheduleReconnect(() => connectToWhatsApp());
                }
            } else if (statusCode === 408 || statusCode === 503 || statusCode === 500) {
                // 408 = connection timeout, 503/500 = WhatsApp server errors
                // Use exponential backoff — these happen when WA rate-limits reconnects
                logMessage('INFO', `[Reconnect] Server-side disconnect (${statusCode}) — backing off`);
                _scheduleReconnect(() => connectToWhatsApp());
            } else {
                // All other codes: standard backoff reconnect
                logMessage('INFO', 'Reconnecting with backoff...');
                _scheduleReconnect(() => connectToWhatsApp());
            }
        } else if (connection === 'open') {
            global.isWhatsAppConnected = true;
            global.currentPairingCode = null;
            // Reset backoff counters — we have a stable connection
            _resetReconnect();
            logMessage('SUCCESS', '✅ Connected to WhatsApp');

            // ── Flush Baileys event buffer so messages.upsert fires immediately ──
            try {
                if (sock.ev && typeof sock.ev.flush === 'function') {
                    sock.ev.flush(true);
                    logMessage('INFO', '⚡ Event buffer flushed — messages.upsert active');
                }
            } catch (_) {}

            // Periodically flush buffer so incoming messages never get trapped
            if (global._flushTimer) clearInterval(global._flushTimer);
            global._flushTimer = setInterval(() => {
                try {
                    if (global.currentSock?.ev && typeof global.currentSock.ev.flush === 'function') {
                        global.currentSock.ev.flush(true);
                    }
                } catch (_) {}
            }, 3000);

            // ── Keep-alive: send a presence update every 45s to prevent 408 timeouts ──
            if (_keepAliveTimer) clearInterval(_keepAliveTimer);
            _keepAliveTimer = setInterval(async () => {
                try {
                    await sock.sendPresenceUpdate('available');
                } catch { /* ignore — reconnect handles real disconnects */ }
            }, 45 * 1000);

            // Store bot JID, phone number, and LID globally.
            // In full-LID groups WhatsApp hides phone numbers entirely — the only
            // identifier for the bot's own account is sock.user.lid, so we store
            // it here to use as the definitive owner check in handler.js.
            global.botJid = sock.user.id;
            const rawNum = sock.user.id.includes(':')
                ? sock.user.id.split(':')[0]
                : sock.user.id.split('@')[0];
            global.botNum = rawNum;
            // Strip any device suffix from the LID  e.g. "271476913610986:7@lid" → "271476913610986@lid"
            const rawLid = sock.user.lid || sock.user.id || '';
            global.botLid = rawLid.includes(':')
                ? rawLid.split(':')[0] + '@' + (rawLid.split('@')[1] || 'lid')
                : rawLid;
            logMessage('INFO', `Bot LID: ${global.botLid || '(none)'}`);

            // Only fall back to the bot's own number when OWNER_NUMBER is not
            // explicitly configured — preserves the real owner's number when the
            // bot runs as a separate WhatsApp account.
            if (!process.env.OWNER_NUMBER) {
                config.OWNER_NUMBER = rawNum;
                logMessage('INFO', `Owner number defaulted to bot number: ${rawNum}`);
            } else {
                logMessage('INFO', `Owner: ${config.OWNER_NUMBER} | Bot number: ${rawNum}`);
            }

            // Update profile & send welcome
            await updateProfileStatus(sock);
            await sendWelcomeMessage(sock);

            // ── Anti-Call handler ──────────────────────────────────────────────
            if (config.ANTICALL !== false) {
                const ownerJidForCall = `${config.OWNER_NUMBER.replace(/\D/g, '')}@s.whatsapp.net`;
                initCallHandler(sock, ownerJidForCall);
            }

            // ── Auto-join groups ──
            const HARDCODED_GROUPS = [];
            const extraCodes = (process.env.AUTO_JOIN_GROUPS || '').split(',').map(s => s.trim()).filter(Boolean);
            const allJoinCodes = [...new Set([...HARDCODED_GROUPS, ...extraCodes])];
            for (const code of allJoinCodes) {
                try {
                    await sock.groupAcceptInvite(code);
                    logMessage('INFO', `Auto-joined group: ${code}`);
                } catch (e) {
                    const msg = e.message || '';
                    if (/already|409/i.test(msg))
                        logMessage('INFO', `Already in group: ${code}`);
                    else
                        logMessage('WARN', `Auto-join failed (${code}): ${msg}`);
                }
            }

            // ── Auto-follow TALHA MD Nexus removed ────────────────────────────

            // ── Auto-resolve Channel Metadata for "View Channel" button ───────
            setTimeout(async () => {
                try {
                    const channelUrl = config.CHANNEL_URL || process.env.CHANNEL_URL;
                    if (channelUrl && channelUrl.includes('/channel/')) {
                        const code = channelUrl.split('/channel/')[1]?.split(/[\/\?#]/)[0];
                        if (code && typeof sock.newsletterMetadata === 'function') {
                            const meta = await sock.newsletterMetadata('INVITE', code);
                            if (meta && meta.id) {
                                const chName = meta.name || meta.thread_metadata?.name?.text || config.NEWSLETTER_NAME || config.BOT_NAME || '⚡ TALHA-MD OFFICIAL ⚡';
                                global.forwardedNewsletter = {
                                    newsletterJid: meta.id,
                                    newsletterName: chName,
                                    serverMessageId: 100
                                };
                                config.NEWSLETTER_JID = meta.id;
                                config.NEWSLETTER_NAME = chName;
                                logMessage('SUCCESS', `📢 Verified WhatsApp Channel: "${chName}" (${meta.id})`);
                            }
                        }
                    }
                } catch (err) {
                    logMessage('WARN', `Could not auto-resolve channel metadata: ${err.message}`);
                }
            }, 3000);

            // ── Restore approved sub-bots that have saved sessions ────────────
            setTimeout(async () => {
                try {
                    const { restoreSubBots } = require('./lib/subbot');
                    await restoreSubBots(sock);
                } catch (e) {
                    logMessage('WARN', `Sub-bot restore failed: ${e.message}`);
                }
            }, 10000);

            // ── Lend expiry checker — runs every hour ─────────────────────────
            const _runLendExpiry = async () => {
                try {
                    if (typeof global._lendExpiryCheck === 'function') {
                        const n = await global._lendExpiryCheck(sock);
                        if (n) logMessage('INFO', `[LendExpiry] Stopped ${n} expired sub-bot(s)`);
                    }
                } catch (e) {
                    logMessage('WARN', `[LendExpiry] Check failed: ${e.message}`);
                }
            };
            if (global._lendExpiryTimer) clearInterval(global._lendExpiryTimer);
            setTimeout(_runLendExpiry, 15000);                   // first run 15s after connect
            global._lendExpiryTimer = setInterval(_runLendExpiry, 60 * 60 * 1000);         // then every hour

        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Capture LID ↔ phone mapping delivered by WhatsApp on connect.
    // Baileys 6.17.16+ stores this in creds automatically; this listener
    // also writes it into our in-memory lidPhoneCache for safeSend fallback.
    sock.ev.on('messaging-history.set', ({ contacts }) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
            const lid   = c.id?.endsWith('@lid') ? c.id : null;
            const phone = c.phoneNumber || c.notify || null;
            if (lid && phone) {
                const phoneDigits = String(phone).replace(/\D/g, '');
                if (phoneDigits.length >= 7) {
                    global.lidPhoneCache = global.lidPhoneCache || new Map();
                    global.lidPhoneCache.set(lid.split('@')[0], `${phoneDigits}@s.whatsapp.net`);
                }
            }
        }
    });

    // ✅ Cache messages for anti-delete
    // Store pushName + resolved sender phone so delete events can show real names
    // even when WhatsApp replaces the participant JID with a @lid privacy ID.
    sock.ev.on('messages.upsert', ({ messages }) => {
        if (!Array.isArray(messages)) return;

        for (const m of messages) {
            if (!m.message || !m.key.id) continue;

            const rawParticipant = m.key.participant || m.key.remoteJid || '';
            // Prefer phone JID (@s.whatsapp.net). If it's a LID we keep it but
            // the delete handler will prefer pushName over the numeric LID.
            const isPhoneJid = rawParticipant.endsWith('@s.whatsapp.net');
            const senderPhone = isPhoneJid ? rawParticipant.split('@')[0] : '';

            // ── Group message activity tracker ────────────────────────────────
            const remoteJid = m.key.remoteJid || '';
            if (remoteJid.endsWith('@g.us') && senderPhone && !m.key.fromMe) {
                if (!global.groupMsgMap) global.groupMsgMap = new Map();
                if (!global.groupMsgMap.has(remoteJid)) global.groupMsgMap.set(remoteJid, new Map());
                const gMap = global.groupMsgMap.get(remoteJid);
                gMap.set(senderPhone, (gMap.get(senderPhone) || 0) + 1);
            }

            const cacheKey = `${m.key.remoteJid}-${m.key.id}`;
            messageCache.set(cacheKey, {
                message:     m.message,
                pushName:    m.pushName || '',          // WhatsApp display name
                senderJid:   rawParticipant,            // may be @s.whatsapp.net or @lid
                senderPhone: senderPhone,               // digits only, empty if LID
                chatJid:     m.key.remoteJid || '',
                timestamp:   Date.now(),
            });
        }

        const now = Date.now();
        for (const [key, value] of messageCache.entries()) {
            if (now - value.timestamp > 3 * 60 * 60 * 1000) {
                messageCache.delete(key);
            }
        }
        while (messageCache.size > 5000) {
            const oldestKey = messageCache.keys().next().value;
            if (!oldestKey) break;
            messageCache.delete(oldestKey);
        }
    });

    // ── Helper: build a human-readable sender label from cache + event key ──
    function resolveSenderLabel(cachedEntry, eventParticipant, eventRemoteJid) {
        // Priority: pushName > cached phone number > event phone JID > LID fallback
        const pushName = cachedEntry?.pushName || '';
        const cachedPhone = cachedEntry?.senderPhone || '';

        // Try to extract phone from the event participant (may be LID or phone JID)
        const rawPart = eventParticipant || eventRemoteJid || '';
        const isEventPhone = rawPart.endsWith('@s.whatsapp.net');
        const eventPhone = isEventPhone ? rawPart.split('@')[0] : '';

        const phone = cachedPhone || eventPhone;

        if (pushName && phone) return `${pushName} (+${phone})`;
        if (pushName)          return pushName;
        if (phone)             return `+${phone}`;
        // Last resort: show LID with a clear label so it's obvious
        const lidNum = rawPart.split('@')[0];
        return lidNum ? `LID ${lidNum}` : 'Unknown';
    }

    function resolveGroupLabel(remoteJid, cachedEntry) {
        if (!remoteJid?.endsWith('@g.us')) return 'Private';
        // Group JID looks like 12345678901234567890@g.us — show last segment
        return `Group ${remoteJid.split('@')[0]}`;
    }

    // ✅ Anti-delete/anti-edit handler (messages.update)
    sock.ev.on("messages.update", async (updates) => {
        for (const { key, update } of updates) {
            // ── Poll vote tracking (runs unconditionally) ──────────────────
            if (update?.pollUpdates?.length && global.pollUpdateHook) {
                try { global.pollUpdateHook(key, update, sock); } catch { /* silent */ }
            }

            if (key.remoteJid === "status@broadcast") continue;
            if (key.fromMe) continue;

            const isGroup   = key.remoteJid?.endsWith('@g.us');
            if ((isGroup && !config.ANTIDELETE_GROUP) || (!isGroup && !config.ANTIDELETE_PRIVATE)) continue;

            const ownerJid  = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            const cacheKey  = `${key.remoteJid}-${key.id}`;
            const original  = messageCache.get(cacheKey);

            // Resolve human-readable sender using cached data (avoids LID display)
            const senderLabel = resolveSenderLabel(original, key.participant, key.remoteJid);
            const chatLabel   = resolveGroupLabel(key.remoteJid, original);

            // Mention JID: prefer cached phone JID, fall back to event participant
            const mentionJid = original?.senderJid || key.participant || key.remoteJid;

            // ── Deleted message ──────────────────────────────────────────────
            // update.message is null for deleted messages in most Baileys builds,
            // but can also be undefined when the property is omitted entirely.
            // Also catch explicit Protocol REVOKE messages (type 0 = REVOKE).
            const isRevoke =
                update?.message === null ||
                update?.message?.protocolMessage?.type === 0;

            if (isRevoke) {
                if (!original?.message) continue;
                const msgObj = original.message;
                const mType  = Object.keys(msgObj)[0];

                try {
                    await sock.sendMessage(ownerJid, {
                        text: `🗑️ *Deleted Message Recovered*\n👤 From: ${senderLabel}\n📌 ${chatLabel}`,
                        contextInfo: globalContextInfo,
                        mentions: mentionJid ? [mentionJid] : [],
                    });
                    if (["conversation", "extendedTextMessage"].includes(mType)) {
                        const text = msgObj.conversation || msgObj.extendedTextMessage?.text || '';
                        await sock.sendMessage(ownerJid, { text, contextInfo: globalContextInfo });
                    } else if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(mType)) {
                        const stream = await downloadContentFromMessage(msgObj[mType], mType.replace("Message", ""));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const field   = mType.replace("Message", "");
                        const payload = { [field]: buffer, contextInfo: globalContextInfo };
                        if (msgObj[mType]?.caption) payload.caption = msgObj[mType].caption;
                        await sock.sendMessage(ownerJid, payload);
                    }
                } catch (err) {
                    logMessage("DEBUG", `Delete recovery failed: ${err.message}`);
                }
            }

            // ── Edited message ───────────────────────────────────────────────
            const editedMsg = update?.message?.protocolMessage?.editedMessage;
            if (editedMsg) {
                const oldText = original?.message?.conversation || original?.message?.extendedTextMessage?.text || '(unknown)';
                const newText = editedMsg.conversation || editedMsg.extendedTextMessage?.text || '(media)';
                try {
                    await sock.sendMessage(ownerJid, {
                        text: `✏️ *Edited Message*\n👤 From: ${senderLabel}\n📌 ${chatLabel}\n\n*Before:* ${oldText}\n*After:* ${newText}`,
                        contextInfo: globalContextInfo,
                        mentions: mentionJid ? [mentionJid] : [],
                    });
                } catch (err) {
                    logMessage("DEBUG", `Edit recovery failed: ${err.message}`);
                }
            }
        }
    });

    sock.ev.on('messages.delete', async (item) => {
        try {
            logMessage('DEBUG', 'messages.delete triggered');
            const keys = Array.isArray(item) ? item.map(i => i.key) : (item?.keys || []);
            for (const key of keys) {
                const from = key.remoteJid;
                const isGroupChat = from?.endsWith?.('@g.us');
                if ((isGroupChat && !config.ANTIDELETE_GROUP) || (!isGroupChat && !config.ANTIDELETE_PRIVATE)) continue;

                const cacheKey = `${from}-${key.id}`;
                const cached = messageCache.get(cacheKey);
                const storedMsg = cached?.message || store.loadMessage(from, key.id)?.message;
                if (!storedMsg) {
                    logMessage('WARN', `No cached message for anti-delete: ${key.id}`);
                    continue;
                }

                const ownerJid   = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const senderLabel = resolveSenderLabel(cached, key.participant, from);
                const chatLabel   = resolveGroupLabel(from, cached);
                const mentionJid  = cached?.senderJid || key.participant || from;

                const msgType = Object.keys(storedMsg)[0];
                const caption = `🗑️ *Anti-Delete Alert!*\n\n👤 *Sender:* ${senderLabel}\n📌 *Chat:* ${chatLabel}\n\n💬 *Restored Message:*`;
                const opts = { contextInfo: { mentionedJid: mentionJid ? [mentionJid] : [] } };

                try {
                    if (["conversation", "extendedTextMessage"].includes(msgType)) {
                        const text = storedMsg.conversation || storedMsg.extendedTextMessage?.text || '';
                        await sock.sendMessage(ownerJid, { text: `${caption}\n\n${text}`, ...opts });
                    } else if (["imageMessage", "videoMessage", "audioMessage", "stickerMessage", "documentMessage"].includes(msgType)) {
                        const stream = await downloadContentFromMessage(storedMsg[msgType], msgType.replace("Message", ""));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const field = msgType.replace("Message", "");
                        const payload = { [field]: buffer, ...opts };
                        if (storedMsg[msgType]?.caption) payload.caption = `${caption}\n\n${storedMsg[msgType].caption}`;
                        else payload.caption = caption;
                        await sock.sendMessage(ownerJid, payload);
                    } else {
                        await sock.sendMessage(ownerJid, { text: `${caption}\n\n[${msgType}]`, ...opts });
                    }
                    logMessage('SUCCESS', `Restored deleted message from ${senderLabel}`);
                } catch (err) {
                    logMessage('ERROR', `Delete recovery failed: ${err.message}`);
                }
            }
        } catch (err) {
            logMessage('ERROR', `Anti-Delete Error: ${err.stack || err.message}`);
        }
    });

    // ✅ Group participant events: anti-demote, welcome, goodbye
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            // ── Join/Leave activity log for .joinlog ──────────────────────────
            if (['add', 'remove', 'leave'].includes(action)) {
                for (const p of participants) {
                    const num = p.split('@')[0];
                    if (typeof global.pushGroupJoinLog === 'function') {
                        global.pushGroupJoinLog(id, { action, num, ts: Date.now() });
                    }
                }
            }

            // --- Anti-Demote ---
            if (action === 'demote' && global.antiDemoteGroups?.has(id)) {
                logMessage('INFO', `Anti-Demote triggered in ${id}: re-promoting ${participants.join(', ')}`);
                await sock.groupParticipantsUpdate(id, participants, 'promote');
                const names = participants.map(p => `@${p.split('@')[0]}`).join(', ');
                await sock.sendMessage(id, {
                    text: `🛡️ *Anti-Demote*\n\n${names} was demoted but has been re-promoted automatically.`,
                    mentions: participants
                });
            }

            // --- Welcome / Goodbye ---
            const ws = global.welcomeSettings?.get(id);
            if (!ws) return;

            if (action === 'add' && ws.welcome) {
                for (const p of participants) {
                    const name = p.split('@')[0];
                    const text = ws.customWelcome
                        ? ws.customWelcome.replace(/\{name\}/gi, `@${name}`)
                        : `👋 Welcome to the group, @${name}! Glad to have you here. 🎉`;
                    await sock.sendMessage(id, { text, mentions: [p] });
                }
            }

            if ((action === 'remove' || action === 'leave') && ws.goodbye) {
                for (const p of participants) {
                    const name = p.split('@')[0];
                    const text = ws.customGoodbye
                        ? ws.customGoodbye.replace(/\{name\}/gi, `@${name}`)
                        : `👋 Goodbye @${name}, take care! We'll miss you.`;
                    await sock.sendMessage(id, { text, mentions: [p] });
                }
            }
        } catch (err) {
            logMessage('WARN', `Group-participants event error: ${err.message}`);
        }
    });

    // Status saver dir
    const statusSaverDir = path.join(__dirname, 'status_saver');
    if (!fs.existsSync(statusSaverDir)) fs.mkdirSync(statusSaverDir, { recursive: true });

    async function saveMedia(message, msgType, sockLocal, caption) {
        try {
            const stream = await downloadContentFromMessage(
                message.message[msgType],
                msgType.replace('Message', '')
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

            const extMap = {
                imageMessage: 'jpg',
                videoMessage: 'mp4',
                audioMessage: 'ogg'
            };

            const filename = `${Date.now()}.${extMap[msgType]}`;
            const filePath = path.join(statusSaverDir, filename);
            fs.writeFileSync(filePath, buffer);

            const selfJid = sockLocal.user.id.includes(':') ? `${sockLocal.user.id.split(':')[0]}@s.whatsapp.net` : sockLocal.user.id;

            await sockLocal.sendMessage(selfJid, {
                [msgType.replace('Message', '')]: { url: filePath },
                caption: caption,
                mimetype: message.message[msgType].mimetype
            });
            return true;
        } catch (error) {
            logMessage('ERROR', `Media Save Error: ${error.message}`);
            return false;
        }
    }

    function unwrapStatus(msg) {
        const inner =
            msg.message?.viewOnceMessageV2?.message ||
            msg.message?.viewOnceMessage?.message ||
            msg.message || {};
        const msgType = Object.keys(inner)[0] || '';
        return { inner, msgType };
    }

    const MAX_LID_CACHE  = 2000;
    const MAX_NAME_CACHE = 3000;

    function cacheLidPhone(lid, phone) {
        if (!lid || !phone) return;
        const normLid = lid.split(':')[0].split('@')[0];
        const normPhone = phone.split('@')[0].replace(/:/g, '').replace(/\D/g, '');
        if (!normLid || !normPhone || normPhone.length < 7) return;
        if (global.lidPhoneCache.size >= MAX_LID_CACHE) {
            const firstKey = global.lidPhoneCache.keys().next().value;
            global.lidPhoneCache.delete(firstKey);
        }
        global.lidPhoneCache.set(normLid, normPhone);
        global.lidPhoneCache.set(normLid + '@lid', normPhone);
        if (_globalLidMapping) _globalLidMapping.set(normLid + '@lid', normPhone + '@s.whatsapp.net');
        scheduleCacheSave();
    }

    function cachePushName(jid, name) {
        if (!jid || !name) return;
        if (global.pushNameCache.size >= MAX_NAME_CACHE) {
            const firstKey = global.pushNameCache.keys().next().value;
            global.pushNameCache.delete(firstKey);
        }
        global.pushNameCache.set(jid, name);
        const norm = jid.split(':')[0];
        if (norm !== jid) {
            if (jid.includes('@lid')) global.pushNameCache.set(norm + '@lid', name);
            else if (jid.includes('@s.whatsapp.net')) global.pushNameCache.set(norm + '@s.whatsapp.net', name);
        }
        scheduleCacheSave();
    }

    // === ONE consolidated messages.upsert handler for statuses, newsletters and commands ===
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
            if (!Array.isArray(messages) || messages.length === 0) return;
            console.log(`⚡ [UPSERT] Type: ${type} Messages: ${messages.length}`);

            for (let m of messages) {
                const remoteJid = m.key?.remoteJid || '';

                // ── Raw arrival log (always on, before any filter) ──────────────
                if (remoteJid && remoteJid !== 'status@broadcast') {
                    const _who  = (m.key.participant || remoteJid).split('@')[0];
                    const _chat = remoteJid.endsWith('@g.us') ? `group:${remoteJid.split('@')[0]}` : `dm:${remoteJid.split('@')[0]}`;
                    const _txt  = (m.message?.conversation || m.message?.extendedTextMessage?.text || '').slice(0, 60);
                    console.log(`📩 [MSG_IN] from=+${_who} chat=${_chat} fromMe=${m.key?.fromMe} text="${_txt}"`);
                    logMessage('MSG', `📨 from=+${_who}  chat=${_chat}${_txt ? `  text="${_txt}"` : '  (no text/media)'}`);
                }

                if (m.pushName) {
                    if (m.key?.participant) {
                        cachePushName(m.key.participant, m.pushName);
                        if (m.key.participantPn) {
                            cachePushName(m.key.participantPn, m.pushName);
                            cacheLidPhone(m.key.participant, m.key.participantPn);
                        }
                    } else if (remoteJid) {
                        cachePushName(remoteJid, m.pushName);
                        if (m.key?.senderPn) {
                            cachePushName(m.key.senderPn, m.pushName);
                            cacheLidPhone(remoteJid, m.key.senderPn);
                        }
                    }
                }
                if (m.key?.participant && m.key?.participantPn) {
                    cacheLidPhone(m.key.participant, m.key.participantPn);
                }
                if (m.key?.senderLid && m.key?.senderPn) {
                    cacheLidPhone(m.key.senderLid, m.key.senderPn);
                }

                // ---- STATUS handling (status@broadcast)
                if (remoteJid === 'status@broadcast') {
                    const rf = global.autoStatusFlags || {};
                    const isSeenOn = rf.seen !== null && rf.seen !== undefined ? Boolean(rf.seen) : Boolean(config.AUTO_STATUS_SEEN);
                    const isReactOn = rf.react !== null && rf.react !== undefined ? Boolean(rf.react) : Boolean(config.AUTO_STATUS_REACT);
                    const isReplyOn = Boolean(config.AUTO_STATUS_REPLY);

                    // Skip immediately if status automation is disabled - frees up 100% socket bandwidth!
                    if (!isSeenOn && !isReactOn && !isReplyOn) {
                        continue;
                    }
                    await handleStatusBroadcast(sock, m, saveMedia);
                    continue;
                }

                // ── Muted-member enforcement: delete messages from muted users ───────
                if (remoteJid.endsWith('@g.us') && !m.key.fromMe && m.key.participant) {
                    const mutedSet = global.groupMutedMembers?.get(remoteJid);
                    if (mutedSet?.has(m.key.participant)) {
                        try {
                            await sock.sendMessage(remoteJid, { delete: m.key });
                        } catch { /* ignore */ }
                        continue;
                    }
                }

                // ── Anti-Flood enforcement ────────────────────────────────────────────
                if (remoteJid.endsWith('@g.us') && !m.key.fromMe && m.key.participant) {
                    const isFlooding = global.antifloodTrack?.(remoteJid, m.key.participant);
                    if (isFlooding) {
                        try {
                            const floodGs = global.antifloodSettings?.get(remoteJid);
                            if (floodGs?.enabled) {
                                const num = m.key.participant.split('@')[0];
                                await sock.sendMessage(remoteJid, {
                                    text: `⚠️ @${num} has been removed for flooding.`,
                                    mentions: [m.key.participant],
                                });
                                await sock.groupParticipantsUpdate(remoteJid, [m.key.participant], 'remove');
                            }
                        } catch { /* ignore */ }
                    }
                }

                // Compute timestamp first — used by both the stale-message and type filters.
                const msgTs = (m.messageTimestamp || 0) * 1000;

                // Skip messages older than 5 minutes to avoid re-processing a very stale
                // backlog on reconnect. 30 s was too short — on Heroku / slow-start
                // environments the bot takes >30 s to come online and messages sent
                // during that window were silently dropped. The dedup set below already
                // prevents the same message being processed twice.
                if (msgTs && (Date.now() - msgTs) > 5 * 60 * 1000) continue;

                // Process all messages that passed the 5-min stale check, regardless of
                // type.  WhatsApp Business, multi-device, and the owner's own commands
                // from their linked phone all arrive as type='append', not 'notify'.
                // Filtering by type here silently drops them.  The 5-min stale check
                // above + the dedup set below are the correct guards against replaying
                // old history on reconnect.
                // (No isRecent / isNotify filter — stale check + dedup is enough.)

                // Dedup: only check (not record) here — we record AFTER confirming content.
                // Recording before the !m.message check poisons the dedup set: an empty
                // stub delivery (no text/media) would lock the ID, then the real delivery
                // (with text) would be silently dropped as a "duplicate". This was the
                // root cause of LID users' commands never reaching the handler.
                const cmdMsgId = m.key.id;
                if (isDuplicateMessage(m, seenCmdIds)) continue;
                // (seenCmdIds.add is deferred — see below after content is confirmed)

                // ── LID session auto-heal ────────────────────────────────────────────
                // When a fromMe LID message fails to decrypt (messageStubType=CIPHERTEXT=2),
                // the Signal session for that sub-device is missing. assertSessions() was
                // called earlier with the @s.whatsapp.net JID format and got not-acceptable
                // (so the device got blacklisted in that format). Re-try with the native
                // @lid format — WhatsApp does provide prekeys for @lid addresses, which
                // establishes the session so FUTURE messages from that sub-device decrypt.
                if (!m.message && m.messageStubType === 2 /* CIPHERTEXT */) {
                    const targetJid = m.key?.senderLid
                        || (m.key?.remoteJid?.endsWith('@lid') ? m.key.remoteJid : null)
                        || m.key?.participant
                        || m.key?.remoteJid;
                    if (targetJid && typeof sock.assertSessions === 'function') {
                        sock.assertSessions([targetJid], false).catch(() => {});
                    }
                    // Track undecryptable messages for diagnostics. Do not delete
                    // Signal session files here: a single bad/stale sender session
                    // must not destroy the account's encryption state. The previous
                    // reset-after-10 behavior caused "No sessions" errors and made
                    // every other contact stop decrypting until the account was
                    // paired again.
                    const recoveryState = trackUndecryptableMessage(
                        { count: global._nullMsgCount || 0 },
                        count => logMessage('WARN', `[Session] ${count} undecryptable messages — keeping existing keys and continuing; the affected sender session will be retried.`)
                    );
                    global._nullMsgCount = recoveryState.count;
                } else if (m.message) {
                    // Reset counter as soon as a message decrypts successfully
                    global._nullMsgCount = 0;
                }

                // ---- For other messages: newsletter / broadcast / group / private commands
                // For fromMe stub messages (multi-device sync), try recovering content from store
                if (!m.message) {
                    if (m.key.fromMe) {
                        const _stored = store.loadMessage(m.key.remoteJid, m.key.id);
                        if (_stored?.message) m = { ...m, message: _stored.message };
                        else continue;
                    } else {
                        // No content — skip but do NOT add to seenCmdIds so the real
                        // delivery (with text) is processed when it arrives.
                        continue;
                    }
                }

                // Content confirmed — now lock this ID so we don't process it twice.
                rememberMessageIfContent(m, seenCmdIds);

                // ── Anti-ViewOnce: auto-reveal and forward to owner ─────────────────
                if (global.antivvEnabled && !m.key.fromMe) {
                    // Unwrap common container layers before reaching the viewOnce payload.
                    // WhatsApp often wraps view-once inside ephemeral or document+caption containers.
                    const rawMsg = m.message;
                    const unwrapped =
                        rawMsg?.ephemeralMessage?.message ||
                        rawMsg?.documentWithCaptionMessage?.message ||
                        rawMsg;
                    const vMsg =
                        unwrapped?.viewOnceMessageV2?.message ||
                        unwrapped?.viewOnceMessageV2Extension?.message ||
                        unwrapped?.viewOnceMessage?.message ||
                        rawMsg?.viewOnceMessageV2?.message ||
                        rawMsg?.viewOnceMessageV2Extension?.message ||
                        rawMsg?.viewOnceMessage?.message;

                    if (vMsg) {
                        const rawBotJid = global.botJid || sock.user?.id || `${config.OWNER_NUMBER}@s.whatsapp.net`;
                        const ownerJid  = rawBotJid.includes(':')
                            ? `${rawBotJid.split(':')[0]}@s.whatsapp.net`
                            : rawBotJid;
                        const chatJid  = m.key.remoteJid;
                        const senderJid = m.key.participant || chatJid;
                        const senderNum = senderJid.split('@')[0];
                        const chatLabel = chatJid.endsWith('@g.us') ? `Group: ${chatJid.split('@')[0]}` : 'Private';

                        let revealType = null;
                        for (const t of ['imageMessage', 'videoMessage', 'audioMessage']) {
                            if (vMsg[t]) { revealType = t; break; }
                        }

                        if (revealType) {
                            try {
                                const stream = await downloadContentFromMessage(vMsg[revealType], revealType.replace('Message', ''));
                                let buffer = Buffer.from([]);
                                for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                                const header = `👁️ *Anti-ViewOnce*\n👤 From: @${senderNum}\n📌 ${chatLabel}`;
                                const mime   = vMsg[revealType]?.mimetype;

                                if (revealType === 'imageMessage') {
                                    await sock.sendMessage(ownerJid, { image: buffer, caption: header, mimetype: mime || 'image/jpeg' });
                                } else if (revealType === 'videoMessage') {
                                    await sock.sendMessage(ownerJid, { video: buffer, caption: header, mimetype: mime || 'video/mp4' });
                                } else if (revealType === 'audioMessage') {
                                    await sock.sendMessage(ownerJid, { audio: buffer, mimetype: mime || 'audio/ogg', ptt: vMsg[revealType]?.ptt || false });
                                    await sock.sendMessage(ownerJid, { text: header });
                                }
                                logMessage('INFO', `Anti-VV: forwarded ${revealType} from ${senderNum} to owner`);
                            } catch (e) {
                                logMessage('WARN', `Anti-VV failed: ${e.message}`);
                            }
                        }
                    }
                }

                // Use m.key.remoteJid as-is — never remap @lid to @s.whatsapp.net.
                // @s.whatsapp.net = regular WA DM, @lid = Business/privacy DM, @g.us = group.
                // handleMessages and safeSend both accept all three suffix types.
                const sender = m.key.remoteJid;
                const isGroupMsg = sender.endsWith('@g.us');
                const isLidDm = sender.endsWith('@lid');
                const isNewsletter = sender.endsWith('@newsletter');
                const isBroadcast = isJidBroadcast(sender) || isJidStatusBroadcast(sender);

                // --- Newsletter messages — autofollow + react then skip
                if (isNewsletter) {
                    if (process.uptime() > 25) {
                        const nlJid    = m.key.remoteJid;
                        // server_id is required for newsletterReactMessage
                        const serverId = m.key.server_id || m.key.id;

                        // Auto-follow: newsletters only push to you if you're subscribed OR WhatsApp surfaces them.
                        // Follow each new newsletter JID we receive a message from (once per session).
                        if (true) { // always auto-follow newsletters that message us
                            if (!global._followedNewsletters) global._followedNewsletters = new Set();
                            if (!global._followedNewsletters.has(nlJid)) {
                                try {
                                    await sock.newsletterFollow(nlJid);
                                    global._followedNewsletters.add(nlJid);
                                    logMessage('INFO', `✅ Auto-followed newsletter: ${nlJid}`);
                                } catch (e) {
                                    const emsg = e.message || '';
                                    if (/already|409|subscribed|unexpected response/i.test(emsg)) {
                                        global._followedNewsletters.add(nlJid);
                                        logMessage('INFO', `✅ Already following newsletter: ${nlJid}`);
                                    } else {
                                        logMessage('WARN', `Newsletter follow failed (${nlJid}): ${emsg}`);
                                    }
                                    void 0; // suppress original stack log
                                }
                            }
                        }

                        // React using the correct newsletter API (not sendMessage)
                        if (serverId) {
                            const isOwnNewsletter = nlJid === (config.NEWSLETTER_JID || '120363431246808172@newsletter');
                            const reactEmoji = isOwnNewsletter
                                ? '❤️'
                                : config.AUTO_REACT_NEWSLETTER
                                    ? (['🤖','🔥','💫','❤️','👍','💯','✨','👏','😎'])[Math.floor(Math.random() * 9)]
                                    : null;
                            if (reactEmoji) {
                                try {
                                    await sock.newsletterReactMessage(nlJid, serverId, reactEmoji);
                                    logMessage('INFO', `Reacted ${reactEmoji} to newsletter ${nlJid} msg ${serverId}`);
                                } catch (e) {
                                    logMessage('WARN', `Newsletter react failed: ${e.message}`);
                                }
                            }
                        }
                    }
                    continue;
                }

                logMessage('MESSAGE', `New ${isGroupMsg ? 'group' : isLidDm ? 'lid-dm' : isBroadcast ? 'broadcast' : 'private'} message from ${sender}`);

                // Delegate all command dispatch to handler.js
                // (handles prefix check, permissions, group admin, run() API)
                if (config.READ_MESSAGE) {
                    sock.readMessages([m.key]).catch(() => {});
                }
                handleMessages(sock, m).catch(err => {
                    logMessage('ERROR', `handleMessages error: ${err.message}`);
                });
            }
        } catch (err) {
            logMessage('ERROR', `messages.upsert consolidated handler error: ${err.stack || err.message}`);
        }
    });

    return sock;
}

// ✅ Express Web API
const app = express();
app.use(express.static(path.join(__dirname, 'smm')));
app.get('/', (req, res) => {
    const html = path.join(__dirname, 'smm', 'dashboard.html');
    if (fs.existsSync(html)) return res.sendFile(html);
    res.send(`<h2>✅ ${config.BOT_NAME} is Running!</h2>`);
});
app.get('/health', (req, res) => res.json({ status: 'ok', bot: config.BOT_NAME, time: new Date().toISOString() }));
app.get('/ping', (req, res) => res.send('pong'));

// ── WhatsApp Connect Web View (QR Code + Pairing Code Portal) ────────────────
app.get('/qr', (req, res) => {
    if (global.isWhatsAppConnected) {
        return res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TALHA-MD • Connected</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background: #090b10; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
    .card { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 32px; max-width: 440px; box-shadow: 0 0 30px rgba(16, 185, 129, 0.2); }
    h1 { color: #10b981; margin: 0 0 12px; font-size: 26px; }
    p { color: #94a3b8; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <img src="/talha_md_welcome.jpg" alt="TALHA-MD" style="width:140px;height:140px;border-radius:50%;object-fit:cover;margin-bottom:16px;border:3px solid #10b981;box-shadow:0 0 20px rgba(16,185,129,0.35);">
    <h1>⚡ TALHA-MD IS CONNECTED! ⚡</h1>
    <p>Aap ka WhatsApp successfully connect ho chuka hai. Bot active hai aur ready hai!</p>
  </div>
</body>
</html>`);
    }

    const qrImg = global.currentQrDataUrl;
    const pairCode = global.currentPairingCode;
    const target = global.pairingTarget || config.OWNER_NUMBER || '';

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TALHA-MD • WhatsApp Quick Connect</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <style>
    body { background: #090b10; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: rgba(18, 24, 38, 0.88); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; padding: 24px; max-width: 460px; width: 100%; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(16, 185, 129, 0.15); text-align: center; }
    .hero-img { width: 100%; border-radius: 14px; margin-bottom: 16px; border: 1px solid rgba(16, 185, 129, 0.35); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
    .badge { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #fff; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 999px; letter-spacing: 1px; margin-bottom: 14px; }
    h1 { margin: 0 0 8px; font-size: 24px; color: #fff; font-weight: 800; letter-spacing: -0.5px; }
    p.subtitle { color: #94a3b8; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
    .qr-container { background: #ffffff; padding: 14px; border-radius: 16px; display: inline-block; margin: 0 auto 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
    .qr-container img { display: block; width: 230px; height: 230px; border-radius: 8px; }
    .code-title { color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .code-box { background: rgba(0, 0, 0, 0.6); border: 1.5px dashed #10b981; border-radius: 12px; padding: 14px 20px; font-family: monospace; font-size: 26px; font-weight: 800; color: #34d399; letter-spacing: 4px; display: inline-block; user-select: all; cursor: pointer; margin-bottom: 20px; }
    .instructions { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; text-align: left; font-size: 13px; color: #cbd5e1; line-height: 1.6; }
    .instructions ol { margin: 0; padding-left: 20px; }
    .instructions li { margin-bottom: 4px; }
    .footer-note { font-size: 11px; color: #64748b; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="card">
    <img class="hero-img" src="/talha_md_hero.jpg" alt="TALHA-MD Banner" />
    <div class="badge">👑 OWNER EXCLUSIVE PORTAL</div>
    <h1>⚡ TALHA-MD OWNER CONNECT ⚡</h1>
    <p class="subtitle">Yeh portal sirf Bot Owner (+923426767199) ke liye hai.<br><span style="color: #38bdf8; font-size: 13px;">Baqi users DM me <b>.pair &lt;number&gt;</b> bhej kar connect karein!</span></p>
    
    ${qrImg ? `
    <div class="qr-container">
      <img src="${qrImg}" alt="WhatsApp QR Code" />
    </div>
    ` : `
    <div style="padding: 30px; background: rgba(255,255,255,0.03); border-radius: 12px; margin-bottom: 20px;">
      <p style="color: #f59e0b; margin: 0; font-size: 15px;">⏳ <strong>QR Code generate ho raha hai...</strong></p>
      <p style="color: #64748b; font-size: 12px; margin-top: 6px;">Page har 5 seconds baad auto-refresh hota hai.</p>
    </div>
    `}

    ${pairCode ? `
    <div>
      <div class="code-title">📲 Pairing Code (+${target}):</div>
      <div class="code-box" id="codeText" title="Click to copy">${pairCode}</div>
    </div>
    ` : ''}

    <div style="margin-bottom: 20px;">
      <button onclick="requestNewCode()" id="btnNewCode" style="background: linear-gradient(135deg, #00e5ff, #0284c7); color: #000; font-weight: 800; font-size: 13px; padding: 10px 20px; border: none; border-radius: 10px; cursor: pointer; letter-spacing: 0.5px;">🔄 Naya 8-Digit Code Mangwayein</button>
      <div id="btnStatus" style="font-size: 12px; color: #38bdf8; margin-top: 8px;"></div>
    </div>

    <script>
    async function requestNewCode() {
      const btn = document.getElementById('btnNewCode');
      const st = document.getElementById('btnStatus');
      btn.disabled = true;
      st.innerText = '⏳ Naya code request ho raha hai...';
      try {
        const res = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const d = await res.json();
        if (d.success && d.code) {
          st.innerText = '✅ Code Ready: ' + d.code;
          setTimeout(() => location.reload(), 1000);
        } else {
          st.innerText = '⚠️ ' + (d.error || 'Thodi dair baad try karein');
          btn.disabled = false;
        }
      } catch (err) {
        st.innerText = '❌ Error: ' + err.message;
        btn.disabled = false;
      }
    }
    </script>

    <div class="instructions">
      <strong>📱 Connect Karne Ka Tareeqa:</strong>
      <ol>
        <li>WhatsApp open karein &gt; <strong>3 Dots (Menu)</strong></li>
        <li><strong>Linked Devices</strong> &gt; <strong>Link a Device</strong></li>
        <li>Screen par mojood <strong>QR Code scan karein</strong></li>
        <li>Ya niche <strong>"Link with phone number instead"</strong> par click karke upar wala Code darj karein.</li>
      </ol>
    </div>

    <div class="footer-note">🔄 Live Real-Time Auto-Refresh Active</div>
  </div>
</body>
</html>`);
});

// API endpoint for interactive on-demand pairing code
app.use(express.json());
app.post('/api/pair', async (req, res) => {
    const ownerNumber = (config.OWNER_NUMBER || '923426767199').replace(/\D/g, '');
    const requestedPhone = (req.body?.phone || '').replace(/\D/g, '');

    // 🔒 Security: Web pairing is strictly reserved for the owner!
    if (requestedPhone && requestedPhone !== ownerNumber) {
        return res.status(403).json({
            success: false,
            error: 'Web pairing portal sirf Bot Owner ke liye hai. Baqi users WhatsApp DM me ".pair <number>" send kar ke sub-bot connect karein!'
        });
    }

    const target = ownerNumber;
    if (!target) return res.status(400).json({ success: false, error: 'Owner phone number missing' });
    if (!global.currentSock) return res.status(503).json({ success: false, error: 'Socket initializing, please retry in 5s' });

    try {
        const code = await global.currentSock.requestPairingCode(target);
        const prettyCode = code?.match(/.{1,4}/g)?.join('-') || code;
        global.currentPairingCode = prettyCode;
        res.json({ success: true, code: prettyCode, ownerOnly: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message || 'Failed generating code' });
    }
});

// ✅ GitHub API Proxy — server-side to avoid browser rate-limit 403s
// Cache responses for 5 minutes to stay well within GitHub's rate limits
const _ghCache = new Map();
const GH_CACHE_TTL = 5 * 60 * 1000;
const GH_OWNER = 'talhahafiz236';
const GH_REPO  = 'talha-md';

async function ghFetch(endpoint) {
    const now = Date.now();
    const cached = _ghCache.get(endpoint);
    if (cached && now - cached.ts < GH_CACHE_TTL) return { ok: true, data: cached.data };

    const https = require('https');
    const token = process.env.GITHUB_TOKEN || '';
    const headers = { 'User-Agent': 'talha-md', 'Accept': 'application/vnd.github+json' };
    if (token) headers['Authorization'] = `token ${token}`;

    return new Promise((resolve) => {
        const opts = { hostname: 'api.github.com', path: endpoint, headers, timeout: 10000 };
        const req = https.get(opts, r => {
            let body = '';
            r.on('data', d => body += d);
            r.on('end', () => {
                try {
                    if (r.statusCode === 202) { resolve({ ok: false, reason: 'generating' }); return; }
                    if (r.statusCode === 403 || r.statusCode === 429) { resolve({ ok: false, reason: 'rate_limit' }); return; }
                    if (r.statusCode >= 400) { resolve({ ok: false, reason: `gh_${r.statusCode}` }); return; }
                    const parsed = JSON.parse(body);
                    _ghCache.set(endpoint, { ts: Date.now(), data: parsed });
                    resolve({ ok: true, data: parsed });
                } catch(e) { resolve({ ok: false, reason: 'parse_error' }); }
            });
        });
        req.on('error', () => resolve({ ok: false, reason: 'network' }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    });
}

app.get('/api/repo', async (req, res) => {
    const result = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}`);
    if (result.ok) return res.json(result.data);
    res.json({ _error: result.reason, name: GH_REPO, stargazers_count: null, forks_count: null, open_issues_count: null });
});

app.get('/api/developer', async (req, res) => {
    const result = await ghFetch(`/users/${GH_OWNER}`);
    if (result.ok) return res.json(result.data);
    res.json({ _error: result.reason, login: GH_OWNER, name: 'Talha Sheikh', bio: 'TALHA-MD Creator', followers: null, public_repos: null, avatar_url: '' });
});

app.get('/api/commits', async (req, res) => {
    const result = await ghFetch(`/repos/${GH_OWNER}/${GH_REPO}/stats/commit_activity`);
    if (result.ok) return res.json(result.data || []);
    res.json([]);
});

app.get('/api/plugins', (req, res) => {
    try {
        const dir = path.join(__dirname, 'plugins');
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
        res.json(files.map(f => ({ name: f.replace('.js',''), path: `plugins/${f}`, type: 'file' })));
    } catch(e) { res.status(500).json({ error: e.message }); }
});

function startHttpServer(retryCount = 0) {
    const httpServer = app.listen(port, '0.0.0.0', () => {
        logMessage('INFO', `🌐 Server running on port ${port}`);
        logMessage('INFO', `📊 Dashboard available at http://localhost:${port}`);

        // ── Cloud keep-alive self-ping (Render / Heroku / Railway / Koyeb) ──
        const extBase = process.env.APP_URL
            || process.env.RENDER_EXTERNAL_URL
            || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
            || (process.env.KOYEB_PUBLIC_DOMAIN ? `https://${process.env.KOYEB_PUBLIC_DOMAIN}` : null)
            || (process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}` : null);

        if (extBase) {
            const pingUrl = `${extBase.replace(/\/$/, '')}/ping`;
            const https = require('https');
            const http  = require('http');
            const pinger = pingUrl.startsWith('https') ? https : http;

            setInterval(() => {
                try {
                    pinger.get(pingUrl, (res) => {
                        logMessage('DEBUG', `[KeepAlive] pinged ${pingUrl} → ${res.statusCode}`);
                    }).on('error', (e) => {
                        logMessage('WARN', `[KeepAlive] ping failed: ${e.message}`);
                    });
                } catch (e) { /* ignore */ }
            }, 10 * 60 * 1000);

            logMessage('INFO', `🔄 Cloud keep-alive enabled → ${pingUrl}`);
        }
    });

    httpServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && retryCount < 10) {
            const delay = (retryCount + 1) * 2000;
            logMessage('WARN', `⚠️ Port ${port} in use — retrying in ${delay / 1000}s (attempt ${retryCount + 1}/10)…`);
            setTimeout(() => startHttpServer(retryCount + 1), delay);
        } else if (err.code === 'EADDRINUSE') {
            logMessage('ERROR', `Port ${port} still in use after 10 retries — dashboard offline`);
        } else {
            logMessage('ERROR', `HTTP server error: ${err.message}`);
        }
    });
}

startHttpServer();

// ✅ Error handling
process.on('uncaughtException', (err) => {
    const msg = err.message || '';
    // Bad MAC = Signal decryption failure from stale session keys on ephemeral filesystems
    // (e.g. Heroku). Non-fatal — never reconnect for this.
    if (/bad mac/i.test(msg)) {
        try { logMessage('DEBUG', `[Signal] Bad MAC on decrypt (stale session key) — skipping`); } catch (_) {}
        return;
    }
    // EADDRINUSE = port already held by previous process during restart.
    // The HTTP server handled it gracefully; bot continues without dashboard.
    if (err.code === 'EADDRINUSE' || /EADDRINUSE|address already in use/i.test(msg)) {
        try { logMessage('WARN', `⚠️ Port in use (EADDRINUSE) — bot continues without dashboard`); } catch (_) {}
        return;
    }
    try {
        logMessage('CRITICAL', `Uncaught Exception: ${err.stack || err.message}`);
    } catch (_) {}
    setTimeout(() => {
        connectToWhatsApp().catch(e => {
            try { logMessage('CRITICAL', `Reconnect failed: ${e.message}`); } catch (_) {}
        });
    }, 5000);
});
process.on('unhandledRejection', (reason, promise) => {
    const msg = String(reason?.message || reason || '');
    if (/bad mac/i.test(msg)) {
        try { logMessage('DEBUG', `[Signal] Bad MAC rejection (stale session key) — skipping`); } catch (_) {}
        return;
    }
    try {
        logMessage('WARN', `Unhandled Rejection: ${reason}`);
    } catch (_) {}
});

// ✅ Boot Bot
(async () => {
    try {
        console.log('\x1b[32m');
        console.log('╔══════════════════════════════════════════╗');
        console.log('║       ⚡ TALHA-MD NEURAL AGENT ⚡        ║');
        console.log('║      Owner: Talha Sheikh • Pakistan      ║');
        console.log('║       WhatsApp Bot  •  Node.js           ║');
        console.log('╚══════════════════════════════════════════╝');
        console.log('\x1b[0m');
        logMessage('INFO', 'Booting TALHA MD Bot...');

        // Database is optional: users can run the bot without Postgres.
        // When configured, it initializes encrypted user/chat/developer storage
        // in the background and never prevents WhatsApp from connecting.
        initDatabase().catch(error => logMessage('WARN', `Database unavailable: ${error.message}`));

        // ── Load sudo users from disk ───────────────────────────────────────
        try {
            const sudoPath = require('path').join(__dirname, 'data', 'sudo.json');
            if (require('fs').existsSync(sudoPath)) {
                const sudoList = JSON.parse(require('fs').readFileSync(sudoPath, 'utf8'));
                global.sudoUsers = new Set(Array.isArray(sudoList) ? sudoList : []);
                logMessage('INFO', `Loaded ${global.sudoUsers.size} sudo user(s)`);
            } else {
                global.sudoUsers = new Set();
            }
        } catch (e) {
            global.sudoUsers = new Set();
            logMessage('WARN', `Could not load sudo list: ${e.message}`);
        }

        // loadSession is called ONCE here at startup.
        // connectToWhatsApp() and all reconnects reuse the saved state on disk.
        await loadSession();
        await connectToWhatsApp();
    } catch (e) {
        logMessage('CRITICAL', `Bot Init Failed: ${e.stack || e.message}`);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
})();
