const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const db = require('../lib/database');
const config = require('../config');
const theme = require('../lib/theme');

module.exports = {
  vv: {
    desc: "Reveal any View-Once photo or video right in the chat",
    category: "stealth",
    execute: async (sock, m, { reply, from, quoted, prefix }) => {
      if (!quoted) {
        return reply(theme.errorCard('vv', `Kisi View-Once image ya video ke message par reply karke \`${prefix}vv\` likhein!`));
      }

      // 1. Look for message in db store first (gives pristine untampered proto from WA servers)
      let targetMessage = null;
      let targetKey = null;

      if (quoted.stanzaId) {
        const cached = db.getMessage(quoted.stanzaId);
        if (cached && cached.message) {
          targetMessage = cached.message;
          targetKey = cached.key;
        }
      }

      // 2. Fallback to quoted.quotedMessage directly
      if (!targetMessage && quoted.quotedMessage) {
        targetMessage = quoted.quotedMessage;
        targetKey = {
          remoteJid: from,
          id: quoted.stanzaId,
          participant: quoted.participant
        };
      }

      if (!targetMessage) {
        return reply(theme.errorCard('vv', "View-Once message ka data nahi mila. Message shayad bohot purana hai!"));
      }

      // 3. Unwrap viewOnceMessageV2, viewOnceMessage, ephemeralMessage, documentWithCaption
      let innerMsg = targetMessage;
      if (innerMsg.ephemeralMessage?.message) innerMsg = innerMsg.ephemeralMessage.message;
      if (innerMsg.viewOnceMessageV2?.message) innerMsg = innerMsg.viewOnceMessageV2.message;
      if (innerMsg.viewOnceMessage?.message) innerMsg = innerMsg.viewOnceMessage.message;
      if (innerMsg.documentWithCaptionMessage?.message) innerMsg = innerMsg.documentWithCaptionMessage.message;

      const innerType = getContentType(innerMsg) || getContentType(targetMessage);

      if (innerType !== 'imageMessage' && innerType !== 'videoMessage' && innerType !== 'audioMessage') {
        return reply(theme.errorCard('vv', `Yeh message View-Once photo ya video nahi hai! (Type: ${innerType || 'unknown'})`));
      }

      await reply(theme.resultCard('👁️', 'DECRYPTING VIEW-ONCE MEDIA', [
        `🔓 *Type:* ${innerType === 'imageMessage' ? 'View-Once Photo' : (innerType === 'videoMessage' ? 'View-Once Video' : 'Audio Note')}`,
        `⚡ *Action:* Revealing permanent copy in this chat...`
      ]));

      try {
        const downloadKey = targetKey || {
          remoteJid: from,
          id: quoted.stanzaId,
          participant: quoted.participant
        };

        const buffer = await downloadMediaMessage(
          { key: downloadKey, message: innerMsg },
          'buffer',
          {},
          { reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer) {
          return reply(theme.errorCard('vv', "Media decrypt nahi ho saka!"));
        }

        if (innerType === 'imageMessage') {
          const originalCaption = innerMsg.imageMessage?.caption;
          const caption = `┌───「 👁️ *VIEW-ONCE PHOTO REVEALED* 」───
│ 🔓 *Decrypted by:* ${config.BOT_NAME} ⚡
${originalCaption ? `│ 💬 *Original Caption:* "${originalCaption}"\n` : ''}└──────────────────────────────────
_Now permanently visible in this chat!_`;

          await sock.sendMessage(from, {
            image: buffer,
            caption: caption
          }, { quoted: m });

        } else if (innerType === 'videoMessage') {
          const originalCaption = innerMsg.videoMessage?.caption;
          const caption = `┌───「 👁️ *VIEW-ONCE VIDEO REVEALED* 」───
│ 🔓 *Decrypted by:* ${config.BOT_NAME} ⚡
${originalCaption ? `│ 💬 *Original Caption:* "${originalCaption}"\n` : ''}└──────────────────────────────────
_Now permanently visible in this chat!_`;

          await sock.sendMessage(from, {
            video: buffer,
            caption: caption
          }, { quoted: m });

        } else if (innerType === 'audioMessage') {
          await sock.sendMessage(from, {
            audio: buffer,
            mimetype: 'audio/mp4',
            ptt: Boolean(innerMsg.audioMessage?.ptt)
          }, { quoted: m });
        }
      } catch (err) {
        console.error('[Command .vv error]:', err);
        await reply(theme.errorCard('vv', `Media unlock karne mein masla hua: ${err.message}`));
      }
    }
  },

  rvo: {
    desc: "Alias for .vv (Read View-Once)",
    category: "stealth",
    execute: async (sock, m, extra) => {
      return module.exports.vv.execute(sock, m, extra);
    }
  },

  viewonce: {
    desc: "Alias for .vv (Reveal View-Once)",
    category: "stealth",
    execute: async (sock, m, extra) => {
      return module.exports.vv.execute(sock, m, extra);
    }
  },

  mode: {
    desc: "Switch bot mode between public and private",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('mode', "Yeh command sirf Master Talha Sheikh ke liye hai!"));
      const target = args[0]?.toLowerCase();
      if (target !== 'public' && target !== 'private') {
        return reply(theme.errorCard('mode', `Sahi tarika: \`${prefix}mode public\` ya \`${prefix}mode private\``));
      }
      db.set('MODE', target);
      const card = theme.resultCard('🔒', 'BOT ACCESS MODE UPDATED', [
        `⚡ *New Mode:* \`${target.toUpperCase()}\``,
        `👑 *Authorized by:* ${config.OWNER_NAME}`,
        `💡 *Access:* ${target === 'public' ? 'Har koi commands use kar sakta hai' : 'Sirf Master Talha commands chala sakte hain'}`
      ]);
      await reply(card);
    }
  },

  antidelete: {
    desc: "Toggle anti-delete message catcher",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('antidelete', "Sirf Master Talha ke liye!"));
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') {
        db.set('ANTI_DELETE', true);
        const card = theme.resultCard('🛡️', 'ANTI-DELETE ACTIVATED', [
          `⚡ *Status:* \`ENABLED ✅\``,
          `👁️ *Coverage:* Group & Private chats`,
          `🚨 *Action:* Deleted messages will be captured & delivered to owner!`
        ], 'Obsidian Anti-Delete Shield is now ON');
        await reply(card);
      } else if (opt === 'off') {
        db.set('ANTI_DELETE', false);
        const card = theme.resultCard('🛡️', 'ANTI-DELETE DEACTIVATED', [
          `⚡ *Status:* \`DISABLED ❌\``
        ]);
        await reply(card);
      } else {
        await reply(theme.errorCard('antidelete', `Sahi tarika: \`${prefix}antidelete on\` ya \`${prefix}antidelete off\``));
      }
    }
  },

  antivv: {
    desc: "Toggle anti view-once media catcher",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('antivv', "Sirf Master Talha ke liye!"));
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') {
        db.set('ANTI_VIEW_ONCE', true);
        const card = theme.resultCard('👁️', 'ANTI VIEW-ONCE ACTIVATED', [
          `⚡ *Status:* \`ENABLED ✅\``,
          `📸 *Feature:* View-Once photos & videos captured permanently`,
          `📥 *Forward:* Delivered straight to your private chat`
        ]);
        await reply(card);
      } else if (opt === 'off') {
        db.set('ANTI_VIEW_ONCE', false);
        const card = theme.resultCard('👁️', 'ANTI VIEW-ONCE DEACTIVATED', [
          `⚡ *Status:* \`DISABLED ❌\``
        ]);
        await reply(card);
      } else {
        await reply(theme.errorCard('antivv', `Sahi tarika: \`${prefix}antivv on\` ya \`${prefix}antivv off\``));
      }
    }
  },

  anticall: {
    desc: "Toggle automatic call rejection",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('anticall', "Sirf Master Talha ke liye!"));
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') {
        db.set('ANTI_CALL', true);
        const card = theme.resultCard('📞', 'ANTI-CALL ACTIVATED', [
          `⚡ *Status:* \`ENABLED ✅\``,
          `📵 *Action:* Incoming calls auto rejected with polite notice`
        ]);
        await reply(card);
      } else if (opt === 'off') {
        db.set('ANTI_CALL', false);
        const card = theme.resultCard('📞', 'ANTI-CALL DEACTIVATED', [
          `⚡ *Status:* \`DISABLED ❌\``
        ]);
        await reply(card);
      } else {
        await reply(theme.errorCard('anticall', `Sahi tarika: \`${prefix}anticall on\` ya \`${prefix}anticall off\``));
      }
    }
  },

  autostatus: {
    desc: "Toggle auto status viewer",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('autostatus', "Sirf Master Talha ke liye!"));
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') {
        db.set('AUTO_STATUS_SEEN', true);
        const card = theme.resultCard('👁️', 'AUTO-STATUS SEEN ACTIVE', [
          `⚡ *Status:* \`ENABLED ✅\``,
          `📱 *Feature:* All contact WhatsApp statuses viewed automatically`
        ]);
        await reply(card);
      } else if (opt === 'off') {
        db.set('AUTO_STATUS_SEEN', false);
        const card = theme.resultCard('👁️', 'AUTO-STATUS SEEN DISABLED', [
          `⚡ *Status:* \`DISABLED ❌\``
        ]);
        await reply(card);
      } else {
        await reply(theme.errorCard('autostatus', `Sahi tarika: \`${prefix}autostatus on\` ya \`${prefix}autostatus off\``));
      }
    }
  },

  autotyping: {
    desc: "Toggle auto fake typing presence",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('autotyping', "Sirf Master Talha ke liye!"));
      const opt = args[0]?.toLowerCase();
      if (opt === 'on') {
        db.set('AUTO_TYPING', true);
        const card = theme.resultCard('⌨️', 'AUTO-TYPING PRESENCE ON', [
          `⚡ *Status:* \`ENABLED ✅\``,
          `👻 *Effect:* "typing..." indicator appears before reply`
        ]);
        await reply(card);
      } else if (opt === 'off') {
        db.set('AUTO_TYPING', false);
        const card = theme.resultCard('⌨️', 'AUTO-TYPING PRESENCE OFF', [
          `⚡ *Status:* \`DISABLED ❌\``
        ]);
        await reply(card);
      } else {
        await reply(theme.errorCard('autotyping', `Sahi tarika: \`${prefix}autotyping on\` ya \`${prefix}autotyping off\``));
      }
    }
  },

  setprefix: {
    desc: "Change bot command prefix symbol",
    category: "settings",
    execute: async (sock, m, { args, reply, isOwner, prefix }) => {
      if (!isOwner) return reply(theme.errorCard('setprefix', "Sirf Master Talha ke liye!"));
      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length > 2) {
        return reply(theme.errorCard('setprefix', `Sahi symbol likhein! Example: \`${prefix}setprefix !\` ya \`${prefix}setprefix #\``));
      }
      db.set('PREFIX', newPrefix);
      const card = theme.resultCard('🕹️', 'PREFIX SYMBOL UPDATED', [
        `⚡ *New Prefix:* \`[ ${newPrefix} ]\``,
        `💡 *Try Commands:* \`${newPrefix}menu\`, \`${newPrefix}ping\`, \`${newPrefix}song\``
      ], 'All commands now trigger with the new prefix!');
      await reply(card);
    }
  }
};
