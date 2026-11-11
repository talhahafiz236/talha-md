'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { getStr, getActiveTheme } = require('./lib/theme');
const { extractMessageText, unwrapMessageContent } = require('./lib/message-utils');
const { dlBuffer } = require('./lib/dlmedia');
const { recordUser } = require('./lib/database');

let isJidGroup, areJidsSameUser, jidNormalizedUser, normalizeMessageContent;
try {
    ({ isJidGroup, areJidsSameUser, jidNormalizedUser, normalizeMessageContent } = require('@whiskeysockets/baileys'));
} catch {
    isJidGroup            = (jid) => typeof jid === 'string' && jid.endsWith('@g.us');
    jidNormalizedUser     = (jid) => (jid || '').replace(/:[^@]+@/, '@');
    areJidsSameUser       = (a, b) => jidNormalizedUser(a) === jidNormalizedUser(b);
    normalizeMessageContent = (c) => c;
}

// Extract the bare phone-number string from any JID format
function jidToNum(jid) {
    if (!jid) return '';
    return jidNormalizedUser(jid).split('@')[0].replace(/\D/g, '');
}

// True when two phone numbers refer to the same subscriber.
// Handles missing country codes by comparing the last 9 significant digits.
function sameNumber(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const minLen = Math.min(a.length, b.length);
    const tail   = Math.min(minLen, 9);
    return tail >= 6 && a.slice(-tail) === b.slice(-tail);
}

function isBotIdentity(candidate, identities) {
    if (!candidate) return false;
    return identities.some(identity => {
        if (!identity) return false;
        if (areJidsSameUser(candidate, identity)) return true;

        const candidateNumber = jidToNum(candidate);
        const identityNumber  = jidToNum(identity);
        const candidateIsPhone = /@(s\.whatsapp\.net|c\.us)$/.test(candidate);
        const identityIsPhone  = /@(s\.whatsapp\.net|c\.us)$/.test(identity);
        return candidateIsPhone && identityIsPhone
            && sameNumber(candidateNumber, identityNumber);
    });
}

// ─── Permission constants ────────────────────────────────────────────────────
const PERM = {
    PUBLIC: 'public',
    ADMIN:  'admin',
    OWNER:  'owner'
};

// ─── Group metadata cache (5 min TTL) ───────────────────────────────────────
const groupCache = new Map();
const GROUP_CACHE_TTL = 5 * 60 * 1000;

async function getCachedGroupMetadata(sock, jid) {
    const hit = groupCache.get(jid);
    if (hit && Date.now() < hit.expiry) return hit.metadata;
    try {
        const metadata = await sock.groupMetadata(jid);
        groupCache.set(jid, { metadata, expiry: Date.now() + GROUP_CACHE_TTL });
        return metadata;
    } catch {
        return null;
    }
}

// Invalidate cache when group membership changes
function bindGroupCacheInvalidation(sock) {
    sock.ev.on('group-participants.update', ({ id }) => groupCache.delete(id));
}

const sendTimestamps = [];
const MAX_SENDS_PER_MIN = 120;

// Track arrival time of the latest incoming message per chat so the first
// user-facing reply waits at least MIN_RESPONSE_DELAY_MS (>= 1000ms).
const incomingTimestampByJid = new Map();

function markIncomingArrival(jid, ts = Date.now()) {
    if (!jid) return;
    const minDelay = Math.max(1000, Number(config.MIN_RESPONSE_DELAY_MS) || 1200);
    const entry = {
        ts,
        readyAt: ts + minDelay,
        replied: false,
        composingSent: false,
    };
    incomingTimestampByJid.set(jid, entry);
    const norm = jidNormalizedUser(jid);
    if (norm && norm !== jid) incomingTimestampByJid.set(norm, entry);
    if (incomingTimestampByJid.size > 2000) {
        const now = Date.now();
        for (const [k, v] of incomingTimestampByJid.entries()) {
            if (now - v.ts > 10 * 60 * 1000) incomingTimestampByJid.delete(k);
            if (incomingTimestampByJid.size <= 1500) break;
        }
    }
}

const CONTROL_MESSAGE_KEYS = new Set([
    'delete', 'react', 'disappearingMessagesInChat', 'groupStatusMessage', 'pin', 'edit', 'protocolMessage'
]);
const USER_FACING_MESSAGE_KEYS = new Set([
    'text', 'image', 'video', 'audio', 'document', 'sticker', 'contacts', 'contact',
    'location', 'poll', 'buttons', 'list', 'interactive', 'template', 'product',
    'viewOnceMessage', 'forward', 'ptv'
]);

function isUserFacingMessage(content) {
    if (!content || typeof content !== 'object') return false;
    const keys = Object.keys(content);
    if (!keys.length) return false;
    if (keys.some(k => CONTROL_MESSAGE_KEYS.has(k))) return false;
    return keys.some(k => USER_FACING_MESSAGE_KEYS.has(k));
}

function getChatCacheKeys(jid, id) {
    const keys = [];
    if (jid && id) keys.push(`${jid}-${id}`);
    const norm = jidNormalizedUser(jid || '');
    if (norm && id && `${norm}-${id}` !== `${jid}-${id}`) keys.push(`${norm}-${id}`);
    if (id) keys.push(`id-${id}`);
    return keys;
}

function cacheOutgoingMessage(sock, sentMsg) {
    if (!sentMsg?.key?.id || !sentMsg?.message) return;
    if (!sock.__sentMessageCache) sock.__sentMessageCache = new Map();
    const entry = {
        message: sentMsg.message,
        timestamp: Date.now(),
    };
    for (const cacheKey of getChatCacheKeys(sentMsg.key.remoteJid, sentMsg.key.id)) {
        sock.__sentMessageCache.set(cacheKey, entry);
    }
    while (sock.__sentMessageCache.size > 1500) {
        const oldest = sock.__sentMessageCache.keys().next().value;
        if (!oldest) break;
        sock.__sentMessageCache.delete(oldest);
    }
    if (typeof global.cacheSentMessage === 'function') {
        try { global.cacheSentMessage(sentMsg); } catch {}
    }
}

function wrapSocketMessaging(sock) {
    if (!sock || sock.__talhaWrapped || typeof sock.sendMessage !== 'function') return sock;
    sock.__talhaWrapped = true;
    if (!sock.__sentMessageCache) sock.__sentMessageCache = new Map();
    if (!sock.__chatSendQueues) sock.__chatSendQueues = new Map();
    if (!sock.__lastSentAtByJid) sock.__lastSentAtByJid = new Map();

    if (typeof sock.__getSentMessage !== 'function') {
        sock.__getSentMessage = (key) => {
            if (!key?.id) return undefined;
            for (const cacheKey of getChatCacheKeys(key.remoteJid, key.id)) {
                const hit = sock.__sentMessageCache.get(cacheKey);
                if (hit?.message) return hit.message;
            }
            return undefined;
        };
    }

    const origSendMessage = sock.sendMessage.bind(sock);

    sock.sendMessage = async function (jid, content, opts = {}) {
        content = withNewsletterContext(jid, content);
        const userFacing = Boolean(
            jid
            && !String(jid).endsWith('@newsletter')
            && jid !== 'status@broadcast'
            && isUserFacingMessage(content)
        );

        // Strip internal control option before forwarding to Baileys
        let sendOpts = opts;
        const skipMinDelay = Boolean(opts?._skipMinDelay);
        if (opts && Object.prototype.hasOwnProperty.call(opts, '_skipMinDelay')) {
            const { _skipMinDelay: _ignored, ...rest } = opts;
            sendOpts = rest;
        }

        const executeSend = async () => {
            // Enforce >= MIN_RESPONSE_DELAY_MS (>= 1000ms) on EVERY user-facing message
            // both after the user's incoming command AND between multi-part messages.
            if (userFacing && !skipMinDelay) {
                const minDelay = Math.max(1000, Number(config.MIN_RESPONSE_DELAY_MS) || 1200);
                const queueKey = jidNormalizedUser(jid) || jid;
                const lastSentAt = sock.__lastSentAtByJid.get(queueKey) || 0;
                const turn = incomingTimestampByJid.get(jid) || incomingTimestampByJid.get(queueKey);

                let targetAt = lastSentAt ? (lastSentAt + minDelay) : 0;
                if (turn) {
                    const turnTarget = (turn.ts || Date.now()) + minDelay;
                    targetAt = Math.max(targetAt, turnTarget);
                    turn.replied = true;
                } else if (!targetAt) {
                    targetAt = Date.now() + minDelay;
                }

                const remaining = targetAt - Date.now();
                if (remaining > 0) {
                    if (remaining > 150 && typeof sock.sendPresenceUpdate === 'function') {
                        sock.sendPresenceUpdate('composing', jid).catch(() => {});
                    }
                    await new Promise(r => setTimeout(r, remaining));
                }
            }

            // Pre-check Signal session for @lid (and assert peer devices) to prevent waiting/mac errors
            if (userFacing && typeof jid === 'string' && jid.endsWith('@lid') && typeof sock.assertSessions === 'function') {
                await sock.assertSessions([jid], false).catch(() => {});
            }

            let res;
            try {
                res = await origSendMessage(jid, content, sendOpts);
            } catch (err) {
                const msg = String(err?.message || '');
                if (userFacing && /no sessions|session|prekey|mac|not-acceptable/i.test(msg) && typeof sock.assertSessions === 'function') {
                    await new Promise(r => setTimeout(r, 400));
                    await sock.assertSessions([jid], true).catch(() => {});
                    res = await origSendMessage(jid, content, sendOpts);
                } else {
                    throw err;
                }
            } finally {
                if (userFacing) {
                    const queueKey = jidNormalizedUser(jid) || jid;
                    sock.__lastSentAtByJid.set(queueKey, Date.now());
                }
            }

            if (res) cacheOutgoingMessage(sock, res);
            return res;
        };

        // Serialize all user-facing messages per chat so Signal ratchet state never races
        if (!userFacing || !jid) {
            return executeSend();
        }

        const queueKey = jidNormalizedUser(jid) || jid;
        const prev = sock.__chatSendQueues.get(queueKey) || Promise.resolve();
        const next = prev.catch(() => {}).then(executeSend);
        sock.__chatSendQueues.set(queueKey, next);
        try {
            return await next;
        } finally {
            if (sock.__chatSendQueues.get(queueKey) === next) {
                sock.__chatSendQueues.delete(queueKey);
            }
        }
    };

    return sock;
}

async function safeSend(sock, jid, content, opts = {}) {
    if (!jid || !sock?.sendMessage) return null;
    wrapSocketMessaging(sock);

    // Reject obviously invalid JIDs. Valid DM suffixes: @s.whatsapp.net, @lid, @c.us
    // Valid group suffix: @g.us. Anything else (e.g. a bare phone number) is rejected.
    const validSuffix = jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid')
        || jid.endsWith('@g.us') || jid.endsWith('@c.us') || jid.endsWith('@newsletter');
    if (!validSuffix) {
        console.error(`❌ SEND ABORTED — invalid JID "${jid}" (must end @s.whatsapp.net / @lid / @g.us)`);
        return null;
    }

    const _preview = (content?.text || content?.caption || '[media]').toString().slice(0, 60);
    const _to      = jid.split('@')[0];

    // High-speed dispatch (rate guard only for extreme bursts)
    const now = Date.now();
    while (sendTimestamps.length && now - sendTimestamps[0] > 60000) sendTimestamps.shift();
    if (sendTimestamps.length >= MAX_SENDS_PER_MIN) {
        const wait = 60000 - (now - sendTimestamps[0]);
        await new Promise(r => setTimeout(r, Math.min(wait, 1000)));
    }
    sendTimestamps.push(Date.now());

    // Attempt 1 — primary: m.key.remoteJid as-is, full opts (quoted + contextInfo)
    try {
        const result = await sock.sendMessage(jid, content, opts);
        console.log(`✉️  OUT  to=${_to}  "${_preview}"`);
        return result;
    } catch (err) {
        console.error(`❌ SEND FAILED (attempt 1)  to=${jid}: ${err.message}`);
    }

    // Attempt 2 — strip quoted reply.
    // WhatsApp Business messages carry a messageContextInfo wrapper that Baileys
    // embeds when building the quoted context; WA Business servers reject it.
    // Also strip newsletter forwardedNewsletterMessageInfo from content contextInfo.
    if (opts.quoted) {
        const { quoted: _q, ...optsNoQuote } = opts;
        const safeContent = { ...content };
        if (safeContent.contextInfo?.forwardedNewsletterMessageInfo) {
            const { forwardedNewsletterMessageInfo: _n, ...ci } = safeContent.contextInfo;
            safeContent.contextInfo = Object.keys(ci).length ? ci : undefined;
        }
        try {
            const result = await sock.sendMessage(jid, safeContent, optsNoQuote);
            console.log(`✉️  OUT (no-quote retry)  to=${_to}  "${_preview}"`);
            return result;
        } catch (err2) {
            console.error(`❌ SEND FAILED (attempt 2 no-quote)  to=${jid}: ${err2.message}`);
        }
    }

    // Attempt 3 — plain text, zero opts
    if (content?.text || content?.caption) {
        const plainText = content.text || content.caption;
        try {
            const result = await sock.sendMessage(jid, { text: plainText });
            console.log(`✉️  OUT (plain fallback)  to=${_to}  "${_preview}"`);
            return result;
        } catch (err3) {
            console.error(`❌ SEND FAILED (attempt 3 plain)  to=${jid}: ${err3.message}`);
        }
    }

    return null;
}

// Newsletter attribution added to every user-facing outgoing message. This is
// installed once on the live socket, so legacy plugins that call sock.sendMessage
// directly receive the same behavior as plugins using safeSend/ctx.reply.
function getNewsletterInfo() {
    if (global.forwardedNewsletter && global.forwardedNewsletter.newsletterJid) {
        return global.forwardedNewsletter;
    }
    return {
        newsletterJid: process.env.NEWSLETTER_JID || config.NEWSLETTER_JID || '120363431246808172@newsletter',
        newsletterName: process.env.NEWSLETTER_NAME || config.NEWSLETTER_NAME || '⚡ TALHA-MD OFFICIAL ⚡',
        serverMessageId: 100
    };
}

const GLOBAL_CONTEXT_INFO = {
    forwardingScore: 999,
    isForwarded: true,
    get forwardedNewsletterMessageInfo() {
        return getNewsletterInfo();
    }
};

const NEWSLETTER_MESSAGE_KEYS = new Set([
    'text', 'image', 'video', 'audio', 'document', 'sticker', 'contact',
    'location', 'poll', 'buttons', 'list', 'interactive', 'template', 'product'
]);

function withNewsletterContext(jid, content) {
    if (!content || typeof content !== 'object' || jid?.endsWith('@newsletter')) return content;
    if (!Object.keys(content).some(key => NEWSLETTER_MESSAGE_KEYS.has(key))) return content;
    const nlInfo = getNewsletterInfo();
    return {
        ...content,
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            ...(content.contextInfo || {}),
            forwardedNewsletterMessageInfo: {
                ...nlInfo,
                ...(content.contextInfo?.forwardedNewsletterMessageInfo || {})
            }
        }
    };
}

function installNewsletterForwarding(sock) {
    // Wrap socket messaging once so delay, @lid session assertion, retry, and sent cache apply globally
    return wrapSocketMessaging(sock);
}

// ─── Plugin loader ───────────────────────────────────────────────────────────
const plugins = [];
const pluginDir = path.join(__dirname, 'plugins');

function loadPlugins() {
    if (!fs.existsSync(pluginDir)) return;
    plugins.length = 0;
    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const pluginPath = path.join(pluginDir, file);
        try {
            delete require.cache[require.resolve(pluginPath)];
            const plugin = require(pluginPath);

            // Support array exports (e.g. module.exports = [plugin1, plugin2, ...])
            const mods = Array.isArray(plugin) ? plugin : [plugin];

            for (const mod of mods) {
                if (!mod) continue;
                if (!mod.commands && mod.name) mod.commands = [mod.name];
                if (!mod.run && typeof mod.handler === 'function') mod.run = mod.handler;

                if (Array.isArray(mod.commands) && mod.commands.length && typeof mod.run === 'function') {
                    plugins.push(mod);
                } else {
                    if (mods.length === 1) console.warn(`[Plugin] Skipped: ${file} — missing commands or run/handler`);
                }
            }
        } catch (err) {
            console.error(`[Plugin] Error loading ${file}: ${err.message}`);
        }
    }
    console.log(`[Plugin] ✅ ${plugins.length} plugins loaded successfully`);
}

loadPlugins();
global.plugins = plugins;
global.reloadPlugins = () => {
    loadPlugins();
    return plugins.length;
};
// ─── Connection handlers ─────────────────────────────────────────────────────
function setupConnectionHandlers(sock) {
    installNewsletterForwarding(sock);
    bindGroupCacheInvalidation(sock);
    sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'open') console.log('[Handler] WhatsApp connection open.');
    });
    sock.ev.on('group-participants.update', async (update) => {
        for (const p of plugins) {
            if (typeof p.onGroupParticipantsUpdate !== 'function') continue;
            try { await p.onGroupParticipantsUpdate(sock, update); } catch { /* ignore */ }
        }
    });
    sock.ev.on('group.join-request', async (update) => {
        for (const p of plugins) {
            if (typeof p.onJoinRequest !== 'function') continue;
            try { await p.onJoinRequest(sock, update); } catch { /* ignore */ }
        }
    });
}

// ─── Command predictor ───────────────────────────────────────────────────────
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
}

function predictCommand(typed, allPlugins) {
    const flat = [];
    for (const plugin of allPlugins)
        for (const cmd of (plugin.commands || []))
            flat.push({ cmd, plugin });

    // 1. Unambiguous prefix match (typed ≥ 3 chars, matches exactly one command)
    if (typed.length >= 3) {
        const hits = flat.filter(({ cmd }) => cmd.startsWith(typed));
        if (hits.length === 1)
            return { plugin: hits[0].plugin, match: hits[0].cmd, confidence: 'prefix' };
        if (hits.length > 1)
            return { matches: [...new Set(hits.map(h => h.cmd))], confidence: 'ambiguous' };
    }

    // 2. Fuzzy match via Levenshtein distance
    //    threshold = 1 for short commands (≤4 chars), 2 for longer ones
    let best = null, bestDist = Infinity;
    for (const { cmd, plugin } of flat) {
        const dist = levenshtein(typed, cmd);
        const threshold = typed.length <= 4 ? 1 : 2;
        if (dist <= threshold && dist < bestDist) {
            best = { plugin, match: cmd, confidence: dist === 1 ? 'typo' : 'fuzzy' };
            bestDist = dist;
        }
    }
    return best;
}

// ─── Main message handler ────────────────────────────────────────────────────
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

async function handleMessages(sock, message) {
    try {
        // normalizeMessageContent unwraps WhatsApp Business / multi-device wrappers:
        // ephemeralMessage, viewOnceMessage, documentWithCaptionMessage, editedMessage, etc.
        // Without this, Business accounts often have msg.conversation === undefined even
        // though the text is buried one level deeper inside a wrapper field.
        const rawMsg = message.message;
        if (!rawMsg) return;
        const _rawDebugText = rawMsg.conversation || rawMsg.extendedTextMessage?.text || '';
        const _isSessionBundleMessage = /^TALHA-MD[~-][A-Za-z0-9+/=_-]{100,}$/.test(_rawDebugText.trim());
        const _dbgTxt = _isSessionBundleMessage ? '[session bundle redacted]' : _rawDebugText.slice(0, 40);
        console.log(`⚡ [HANDLER_ENTER] jid=${message.key?.remoteJid} fromMe=${message.key?.fromMe} text="${_dbgTxt}"`);
        // Session bundles are credentials. Never dispatch a bot's echoed bundle as a command or AI prompt.
        if (_isSessionBundleMessage) return;

        const _normalized = (typeof normalizeMessageContent === 'function'
            ? normalizeMessageContent(rawMsg)
            : rawMsg) || rawMsg;
        const msg = unwrapMessageContent(_normalized) || _normalized;


        // jid  = the chat to respond to — always m.key.remoteJid, NEVER reconstructed.
        // Valid suffixes: @s.whatsapp.net (regular WA), @lid (Business / privacy DM),
        // @g.us (group).  Do NOT remap @lid to @s.whatsapp.net here — safeSend handles
        // session establishment and phone-JID fallback automatically.
        const jid    = message.key.remoteJid;
        // from = the individual who typed the command.
        // For fromMe private messages participant is undefined and jid is the
        // recipient — not the sender.  Correct this so ctx.from always refers
        // to the actual sender (bot's own JID when fromMe, participant when in
        // a group, or the remote JID for incoming private messages).
        const _botOwnJid = global.botJid || '';
        const from = message.key.participant
            || (message.key.fromMe && !isJidGroup(jid) ? (_botOwnJid || jid) : jid);
        const botIdentities = [
            _botOwnJid,
            global.botLid,
            sock.user?.id,
            sock.user?.lid,
            global.botNum ? `${global.botNum}@s.whatsapp.net` : '',
        ].filter(Boolean);
        const isSelfMessage = Boolean(message.key.fromMe)
            || isBotIdentity(from, botIdentities)
            || isBotIdentity(message.key.participant, botIdentities);
        // sender = chat JID for responses (matches legacy plugin expectation of m.key.remoteJid)
        const sender = jid;
        if (!jid || !from) return;

        wrapSocketMessaging(sock);
        markIncomingArrival(jid);

        // ── Auto-presence: fire instantly on every incoming message ──────────
        if (!message.key.fromMe && (config.AUTO_TYPING || config.AUTO_RECORDING)) {
            const presenceType = config.AUTO_RECORDING ? 'recording' : 'composing';
            sock.sendPresenceUpdate(presenceType, jid).catch(() => {});
        }

        // isGroup: @g.us = group, @s.whatsapp.net / @lid / @c.us = DM
        const isGroup = isJidGroup(jid);

        // ── Multi-prefix parser ──────────────────────────────────────────────
        // PREFIX env var supports:
        //   '.'          → only dot prefix
        //   '.,!,/,?'    → comma-separated list — any of them works
        //   'any'        → any single leading non-alphanumeric/non-space char
        //   '' / 'none'  → no prefix needed (bare command words are matched)
        const rawPrefix   = (config.PREFIX || '.').trim();
        const noPrefixMode  = !rawPrefix || rawPrefix.toLowerCase() === 'none' || rawPrefix.toLowerCase() === 'false';
        const anyPrefixMode = rawPrefix.toLowerCase() === 'any';
        const prefixList    = (!noPrefixMode && !anyPrefixMode)
            ? rawPrefix.split(',').map(p => p.trim()).filter(Boolean)
            : [];
        // primary prefix used in help text / plugin output
        const prefix = prefixList[0] || (anyPrefixMode ? '.' : '');

        // In prefix-free mode every outgoing bot message is otherwise
        // indistinguishable from a user command. Never feed our own replies,
        // menus, forwarded text, or error messages back through the dispatcher.
        if (isSelfMessage && noPrefixMode) return;

        // ── Extract text ─────────────────────────────────────────────────────
        // Walk through all known message types — WhatsApp Business and newer
        // WA versions wrap content differently. Order: most specific → most generic.
        let text = extractMessageText(rawMsg, normalizeMessageContent);
        // Interactive menu replies carry stable IDs instead of typed commands.
        // Translate only Silva-owned menu IDs, then reuse the normal dispatcher.
        const menuAction = text.match(/^silva:menu:(?:category:)?(\d+)$/i);
        if (menuAction) text = `menu ${menuAction[1]}`;
        else if (/^silva:menu:(?:home|main)$/i.test(text)) text = 'menu';
        else if (/^silva:menu:help$/i.test(text)) text = 'help menu';

        // Database persistence is deliberately fire-and-forget. A database
        // outage must never delay or block normal WhatsApp message handling.
        recordUser({
            jid: from,
            displayName: message.pushName || '',
            isGroup,
            metadata: { chatJid: jid, hasText: Boolean(text), fromMe: Boolean(message.key.fromMe) }
        }).catch(() => {});

        // ── AFK auto-reply (fires before prefix check, not for owner's own messages) ──
        if (!message.key.fromMe) {
            const afkPlugin = plugins.find(p => p.commands?.includes('afk') && typeof p.isAfk === 'function');
            if (afkPlugin?.isAfk()) {
                const { reason, since } = afkPlugin.getAfkData();
                const th = getActiveTheme()?.global || {};
                await safeSend(sock, jid, {
                    text: [
                        `🤖 *${th.botName || 'TALHA MD'}*`,
                        ``,
                        `${th.greet2 ? `_${th.greet2}!_` : `_Hey!_`} My owner is currently *AFK*.`,
                        `📝 *Reason:* ${reason}`,
                        `⏱ *Away for:* ${formatDuration(Date.now() - since)}`,
                        ``,
                        `_${th.footer || th.botName || 'TALHA MD'}_`
                    ].join('\n'),
                }, { quoted: message });
                return;
            }
        }

        // ── Anti-link (group only, bot must be admin) ────────────────────────
        if (isGroup && !message.key.fromMe) {
            const antilinkOn = config.ANTILINK || global.antilinkGroups?.has(jid);
            if (antilinkOn) {
                const URL_REGEX = /(?:https?:\/\/|www\.)\S+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|gg|me|ly|co|app|xyz|info|tv|link|shop|live|club|online|site|store|pro|in|ng|ke|tz|ug|za|uk)\b(?:\/\S*)?/gi;
                if (URL_REGEX.test(text)) {
                    try {
                        await sock.sendMessage(jid, { delete: message.key });
                        const antlinkMsg = getStr('antlink') || `⚠️ @${from.split('@')[0]} links are not allowed in this group.`;
                        await safeSend(sock, jid, {
                            text: antlinkMsg,
                            mentions: [from]
                        });
                    } catch (e) {
                        console.error('[Antilink] delete failed:', e.message);
                    }
                    return;
                }
            }
        }

        // ── onMessage hooks — fired for ALL messages (not just commands) ────────
        // Tracking and auto-reply only for other people's messages (not the bot's own).
        if (!message.key.fromMe) {
            if (typeof global.trackMessage === 'function') try { global.trackMessage(jid, from); } catch {}
            if (typeof global.addXP === 'function') {
                try { global.addXP(jid, from); } catch {}
            }
            if (!isGroup && typeof global.checkAutoReply === 'function') {
                try {
                    const autoReply = global.checkAutoReply(from);
                    if (autoReply) {
                        await safeSend(sock, jid, { text: `💤 *Auto-Reply:*\n\n${autoReply}` }, { quoted: message });
                    }
                } catch {}
            }
            if (isGroup && typeof global.checkWelcomeQuizAnswer === 'function') {
                try {
                    const result = global.checkWelcomeQuizAnswer(jid, from, text);
                    if (result?.passed) {
                        await safeSend(sock, jid, { text: `✅ @${from.split('@')[0]} passed the welcome quiz! Welcome to the group! 🎉`, mentions: [from] });
                    }
                } catch {}
            }
        }
        // Resolve sender identity & cached group metadata once so both onMessage hooks
        // and command dispatch have accurate groupId / isAdmin / isBotAdmin / isOwner.
        let isAdmin       = false;
        let isBotAdmin    = false;
        let groupMetadata = null;

        if (isGroup) {
            groupMetadata = await getCachedGroupMetadata(sock, jid);
        }

        const isLid = typeof from === 'string' && from.endsWith('@lid');
        let resolvedFrom = from;

        if (isLid) {
            if (groupMetadata?.participants) {
                for (const p of groupMetadata.participants) {
                    const pLid = p.lid || '';
                    if (pLid && (pLid === from || jidNormalizedUser(pLid) === jidNormalizedUser(from))) {
                        resolvedFrom = p.id;
                        break;
                    }
                }
            }

            if (resolvedFrom === from && global.lidPhoneCache?.size) {
                const normLid = from.split(':')[0].split('@')[0];
                const cachedPhone = global.lidPhoneCache.get(normLid)
                    || global.lidPhoneCache.get(normLid + '@lid')
                    || global.lidPhoneCache.get(from);
                if (cachedPhone) {
                    resolvedFrom = cachedPhone.includes('@')
                        ? cachedPhone
                        : `${cachedPhone.replace(/\D/g, '')}@s.whatsapp.net`;
                }
            }
        }

        const fromNum = jidToNum(resolvedFrom);
        const ownerRaw = (process.env.OWNER_NUMBER || '').trim()
            || (typeof config.OWNER_NUMBER === 'string' ? config.OWNER_NUMBER.trim() : '')
            || (global.botNum || '');
        const ownerNum  = ownerRaw.replace(/\D/g, '');
        const botNum    = (global.botNum || '').replace(/\D/g, '');
        const botLid    = jidNormalizedUser(global.botLid || '');
        const fromNorm  = jidNormalizedUser(from);

        const isSudo = global.sudoUsers?.size
            ? (global.sudoUsers.has(from) || global.sudoUsers.has(fromNorm) || global.sudoUsers.has(resolvedFrom)
               || (fromNum && [...global.sudoUsers].some(s => sameNumber(s.replace(/@.*/, ''), fromNum))))
            : false;

        const isOwner = message.key.fromMe
            || (botLid && fromNorm === botLid)
            || (botLid && jidNormalizedUser(resolvedFrom) === botLid)
            || (fromNum && ownerNum && (fromNum === ownerNum || sameNumber(fromNum, ownerNum)))
            || (fromNum && botNum   && (fromNum === botNum   || sameNumber(fromNum, botNum)))
            || isSudo;

        if (isGroup && groupMetadata?.participants) {
            const botJid   = sock.user?.id || '';
            const botPhone = botNum;

            for (const p of groupMetadata.participants) {
                const role = p.admin;
                const isAdm = role === 'admin' || role === 'superadmin';
                const pPhone = (p.id || '').split('@')[0].replace(/\D/g, '');
                const pLid   = p.lid || '';

                const isSender =
                    areJidsSameUser(p.id, resolvedFrom) ||
                    (pLid && (pLid === from || jidNormalizedUser(pLid) === jidNormalizedUser(from))) ||
                    (pPhone && fromNum && sameNumber(pPhone, fromNum));

                const isBot =
                    areJidsSameUser(p.id, botJid) ||
                    (botLid && (jidNormalizedUser(p.id) === botLid || (pLid && jidNormalizedUser(pLid) === botLid))) ||
                    (botPhone && pPhone && sameNumber(pPhone, botPhone));

                if (isSender) isAdmin    = isAdm;
                if (isBot)    isBotAdmin = isAdm;
            }
        }

        // Plugin onMessage hooks fire concurrently in background without delaying command execution
        const onMsgPlugins = plugins.filter(p => typeof p.onMessage === 'function');
        if (onMsgPlugins.length > 0) {
            const onMsgCtx = {
                sock,
                conn: sock,
                m: message,
                message,
                jid,
                chat: jid,
                sender,
                from,
                groupId: isGroup ? jid : null,
                isGroup,
                isAdmin,
                isBotAdmin,
                isOwner,
                isSudo,
                prefix,
                groupMetadata,
                download: dlBuffer,
                contextInfo: isGroup ? {} : GLOBAL_CONTEXT_INFO,
                safeSend: (content, opts) => safeSend(sock, jid, content, opts),
                reply: (replyText) => safeSend(sock, jid, { text: replyText }, { quoted: message }),
            };
            Promise.allSettled(onMsgPlugins.map(p =>
                p.onMessage(sock, message, text, onMsgCtx)
            )).catch(() => {});
        }


        // ── Detect which prefix was used (or if no prefix needed) ──────────────
        let usedPrefix = null;       // the actual prefix string found in the message
        let commandText = '';        // text with prefix stripped

        if (noPrefixMode) {
            // Any message could be a command — match bare words
            usedPrefix  = '';
            commandText = text.trim();
        } else if (anyPrefixMode) {
            // Any single leading character that isn't alphanumeric / space = prefix
            const first = text[0];
            if (first && !/^[a-zA-Z0-9\u00C0-\u024F\s]/.test(first)) {
                usedPrefix  = first;
                commandText = text.slice(1).trim();
            }
        } else {
            // Exact prefix list — check each in order, longest match wins
            const sorted = [...prefixList].sort((a, b) => b.length - a.length);
            for (const p of sorted) {
                if (text.startsWith(p)) {
                    usedPrefix  = p;
                    commandText = text.slice(p.length).trim();
                    break;
                }
            }
        }

        if (usedPrefix === null) {
            const firstWord = text.trim().split(/\s+/)[0].toLowerCase();
            const isKnownCmd = plugins.some(p => p.commands?.includes(firstWord));
            if (!isGroup && isKnownCmd) {
                // Allow prefix-free commands in private chat (e.g. ping, menu, alive, help)
                usedPrefix = '';
                commandText = text.trim();
            } else {
                const altMatch = text.match(/^([!/#$])(.*)/);
                if (altMatch) {
                    usedPrefix = altMatch[1];
                    commandText = altMatch[2].trim();
                } else {
                    // Allow natural "Talha, ...", "Hey Talha ...", or "agent ..." activation without a prefix.
                    const directAgent = text.trim().match(/^(?:hey\s+)?(talha|silva|agent)(?:\s*[,!:.\-]\s*|\s+|$)(.*)$/i);
                    if (directAgent) {
                        usedPrefix  = '';
                        commandText = `${directAgent[1]} ${directAgent[2] || ''}`.trim();
                    } else {
                        // No prefix matched — fire typing indicator then stop
                        if (!message.key.fromMe && (config.AUTO_TYPING || config.AUTO_RECORDING)) {
                            const presenceType = config.AUTO_RECORDING ? 'recording' : 'composing';
                            try { await sock.sendPresenceUpdate(presenceType, jid); } catch { /* ok */ }
                            setTimeout(async () => {
                                try { await sock.sendPresenceUpdate('paused', jid); } catch { /* ok */ }
                            }, 2000);
                        }
                        return;
                    }
                }
            }
        }

        const parts   = commandText.split(/\s+/);
        const command = (parts.shift() || '').toLowerCase();
        const args    = parts;
        if (!command) return;

        // Prefix-free mode is intentionally command-based, not "reply to every
        // sentence" mode. Keep the natural Silva/agent entry points, but do not
        // fuzzy-match ordinary conversation such as "hello" to a command.
        const exactCommand = plugins.some(p => p.commands?.includes(command));
        const isAgentCommand = ['talha', 'silva', 'agent', 'assistant', 'ask', 'autopilot', 'agent2', 'copilot'].includes(command);
        if (noPrefixMode && !exactCommand && !isAgentCommand) return;

        // Support both `.help <command>` and `.command help` forms. The latter
        // is especially useful for commands discovered from older bot menus.
        const commandHelpTarget = /^(?:help|\?)$/i.test(args[0] || '') ? command : '';
        if (commandHelpTarget) {
            args.splice(0, 1, commandHelpTarget);
        }

        // ── Command predictor: resolve typos / short-forms ───────────────────
        let resolvedCommand = commandHelpTarget ? 'help' : command;
        let predictionNote  = null;
        const exactExists   = plugins.some(p => p.commands?.includes(command));
        if (!commandHelpTarget && !exactExists) {
            const prediction = predictCommand(command, plugins);
            if (prediction?.confidence === 'ambiguous') {
                const th = getActiveTheme()?.global || {};
                await safeSend(sock, jid, {
                    text: [
                        `❓ *Did you mean one of these?*`,
                        prediction.matches.map(c => `• \`${prefix}${c}\``).join('\n'),
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
                if (config.AUTO_TYPING || config.AUTO_RECORDING)
                    try { await sock.sendPresenceUpdate('paused', jid); } catch { /* ok */ }
                return;
            } else if (prediction) {
                resolvedCommand = prediction.match;
                if (prediction.confidence !== 'exact') {
                    const th = getActiveTheme()?.global || {};
                    predictionNote = `_💡 Running_ \`${prefix}${resolvedCommand}\`${th.footer ? `\n_${th.footer}_` : ''}`;
                }
            }
        }

        // ── Build unified context (identity & group metadata already resolved above) ─
        const ctx = {
            sock,
            conn:          sock,
            m:             message,
            message,
            sender,               // = jid (the chat) — where plugins send responses
            from,                 // = individual who typed the command
            jid,
            chat:          jid,
            groupId:       isGroup ? jid : null,
            isGroup,
            isAdmin,
            isBotAdmin,
            isOwner,
            isSudo,
            args,
            text,
            prefix,               // primary/canonical prefix for help text
            usedPrefix,           // the actual prefix that triggered this command
            groupMetadata,
            download:      dlBuffer,
            contextInfo:   isGroup ? {} : GLOBAL_CONTEXT_INFO,
            mentionedJid:  msg.extendedTextMessage?.contextInfo?.mentionedJid || [],
            safeSend:      (content, opts) => safeSend(sock, jid, content, opts),
            reply:         (replyText) => safeSend(sock, jid, { text: replyText }, { quoted: message }),
            theme:         getActiveTheme()?.global || {},
            getStr,
            command:       resolvedCommand,
        };

        // ── Ban gate — banned users cannot trigger any command (owner always exempt) ──
        if (!isOwner && global.bannedUsers?.size) {
            const senderNorm = jidNormalizedUser(from);
            if (global.bannedUsers.has(from) || global.bannedUsers.has(senderNorm) || global.bannedUsers.has(resolvedFrom)) {
                const th = getActiveTheme()?.global || {};
                return await safeSend(sock, jid, {
                    text: [
                        `⛔ *${th.botName || 'TALHA MD'}*`,
                        ``,
                        getStr('owner') || 'You have been banned from using bot commands.',
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
            }
        }

        // ── Dispatch ──────────────────────────────────────────────────────────
        const RECORDING_CMDS = new Set(['play', 'song', 'sticker', 's', 'tiktok', 'tt', 'ttdl', 'tiktokdl', 'youtube', 'yt', 'instagram', 'igdl', 'ig', 'insta', 'facebook', 'fb', 'fbdl']);

        const fromNum2 = from.split('@')[0];
        const _chatLabel = isGroup ? `group:${jid.split('@')[0]}` : `dm:${jid.split('@')[0]}`;
        console.log(`⚡ CMD  "${usedPrefix}${resolvedCommand}"  from=+${fromNum2}  ${_chatLabel}  owner=${isOwner}  admin=${isAdmin}`);

        for (const plugin of plugins) {
            if (!plugin.commands.includes(resolvedCommand)) continue;

            const th = getActiveTheme()?.global || {};

            // ── Scope guards — with themed alerts ────────────────────────────
            const allowGroup   = plugin.group   !== false;
            const allowPrivate = plugin.private !== false;

            if (isGroup && !allowGroup) {
                await safeSend(sock, jid, {
                    text: [
                        `*${th.botName || 'TALHA MD'}*`,
                        ``,
                        getStr('private') || '⚠️ This feature is for private chats only.',
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
                break;
            }

            if (!isGroup && !allowPrivate) {
                await safeSend(sock, jid, {
                    text: [
                        `*${th.botName || 'TALHA MD'}*`,
                        ``,
                        getStr('group') || '❗ This feature is for groups only.',
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
                break;
            }

            // ── Bot admin guard ───────────────────────────────────────────────
            if (plugin.botAdmin && !isBotAdmin) {
                await safeSend(sock, jid, {
                    text: [
                        `*${th.botName || 'TALHA MD'}*`,
                        ``,
                        getStr('botAdmin') || '❗ Please give me admin role first.',
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
                break;
            }

            // ── Permission check ──────────────────────────────────────────────
            const perm = (plugin.permission || PERM.PUBLIC).toLowerCase();
            let allowed = false;
            if      (perm === PERM.PUBLIC) allowed = true;
            else if (perm === PERM.ADMIN)  allowed = isAdmin || isOwner;
            else if (perm === PERM.OWNER)  allowed = isOwner;

            if (!allowed) {
                const alertKey = perm === PERM.OWNER ? 'owner' : 'admin';
                const fallback = perm === PERM.OWNER
                    ? '⛔ This command is reserved for the bot owner.'
                    : '⛔ This command is for group admins only.';
                await safeSend(sock, jid, {
                    text: [
                        `*${th.botName || 'TALHA MD'}*`,
                        ``,
                        getStr(alertKey) || fallback,
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
                break;
            }

            // ── Prediction note: let user know what command was resolved ────
            if (predictionNote) {
                await safeSend(sock, jid, { text: predictionNote }, { quoted: message });
                predictionNote = null;
            }

            // ── Override presence to recording for media commands ───────────
            if (config.AUTO_RECORDING && RECORDING_CMDS.has(resolvedCommand)) {
                sock.sendPresenceUpdate('recording', jid).catch(() => {});
            }

            try {
                const PLUGIN_TIMEOUT_MS = 120_000;
                const _timeoutP = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Plugin timed out after ${PLUGIN_TIMEOUT_MS / 1000}s`)), PLUGIN_TIMEOUT_MS)
                );
                await Promise.race([plugin.run(sock, message, args, ctx), _timeoutP]);
            } catch (err) {
                const isTimeout = /timed out/i.test(err.message);
                console.error(`[Plugin:${command}] ${isTimeout ? '⏱ TIMEOUT' : ''} ${err.stack || err.message}`);
                const errTheme = getActiveTheme();
                const errMsg = isTimeout
                    ? `⏱ That command took too long and was cancelled. Try again.`
                    : (errTheme?.error?.text || `⚠️ Command error: ${err.message || 'unknown error'}`);
                await safeSend(sock, jid, {
                    text: [
                        `*${th.botName || 'TALHA MD'}*`,
                        ``,
                        errMsg,
                        ``,
                        th.footer ? `_${th.footer}_` : ''
                    ].filter(Boolean).join('\n')
                }, { quoted: message });
            }

            // ── Auto-presence: back to paused after responding ───────────────
            if (config.AUTO_TYPING || config.AUTO_RECORDING) {
                sock.sendPresenceUpdate('paused', jid).catch(() => {});
            }

            // ── Only run the first matching plugin — stop after one dispatch ─
            break;
        }
    } catch (err) {
        console.error('[Handler] Fatal:', err.stack || err.message);
    }
}

module.exports = {
    handleMessages,
    safeSend,
    setupConnectionHandlers,
    installNewsletterForwarding,
    withNewsletterContext,
    wrapSocketMessaging,
    markIncomingArrival,
    incomingTimestampByJid,
    groupCache,
    PERM,
    plugins,
    extractMessageText
};
