const theme = require('../lib/theme');
const config = require('../config');

module.exports = {
  tagall: {
    desc: "Mention all members in the group",
    category: "group",
    execute: async (sock, m, { isGroup, reply, from, text, groupMetadata, getGroupInfo, prefix }) => {
      if (!isGroup) return reply(theme.errorCard('tagall', "Yeh command sirf WhatsApp Groups me chalti hai!"));

      let meta = groupMetadata;
      if (!meta && getGroupInfo) {
        const info = await getGroupInfo();
        meta = info.metadata;
      }

      const participants = meta?.participants || [];
      if (!participants.length) return reply(theme.errorCard('tagall', "Group members fetch nahi ho sakay!"));

      let message = `╭━━━〔 📢 *ALL MEMBERS ATTENTION* 📢 〕━━━╮\n`;
      if (text) {
        message += `┃ 💬 *Message:* ${text}\n`;
      }
      message += `┃ 👥 *Total Members:* ${participants.length}\n`;
      message += `┃ ⚡ *Broadcast by:* ${config.BOT_NAME}\n`;
      message += `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

      const mentions = [];
      participants.forEach((p, i) => {
        const num = String(i + 1).padStart(2, '0');
        message += `${num}. ⋄ @${p.id.split('@')[0]}\n`;
        mentions.push(p.id);
      });

      message += `\n_⚡ TALHA-MD Automated Group Mention_`;

      await sock.sendMessage(from, { text: message, mentions }, { quoted: m });
    }
  },

  hidetag: {
    desc: "Stealth mention all members without showing names",
    category: "group",
    execute: async (sock, m, { isGroup, reply, from, text, groupMetadata, getGroupInfo, prefix }) => {
      if (!isGroup) return reply(theme.errorCard('hidetag', "Yeh command sirf Groups me chalti hai!"));
      if (!text) return reply(theme.errorCard('hidetag', `Saath message likhein!\nExample: \`${prefix}hidetag Sab active ho jao meeting hai!\``));

      let meta = groupMetadata;
      if (!meta && getGroupInfo) {
        const info = await getGroupInfo();
        meta = info.metadata;
      }

      const participants = meta?.participants || [];
      const mentions = participants.map(p => p.id);

      const out = `┌───「 👻 *GHOST ANNOUNCEMENT* 」───
│ 📢 *Notice from Admin*
└───────────────────────────────

${text}

───────────────────────────────
_⚡ Invisible Mention • TALHA-MD_`;

      await sock.sendMessage(from, {
        text: out,
        mentions
      });
    }
  },

  kick: {
    desc: "Remove member from group",
    category: "group",
    execute: async (sock, m, { isGroup, reply, from, isBotAdmin, isUserAdmin, isOwner, mentionedJid, getGroupInfo, prefix }) => {
      if (!isGroup) return reply(theme.errorCard('kick', "Sirf Groups me chalta hai!"));

      let bAdmin = isBotAdmin;
      let uAdmin = isUserAdmin;
      if (getGroupInfo && (!bAdmin || !uAdmin)) {
        const info = await getGroupInfo();
        bAdmin = info.isBotAdmin;
        uAdmin = info.isUserAdmin;
      }

      if (!uAdmin && !isOwner) return reply(theme.errorCard('kick', "Yeh command sirf Group Admin ya Master Talha ke liye hai!"));
      if (!bAdmin) return reply(theme.errorCard('kick', "Mujhe pehle Group Admin banayein!"));

      const target = mentionedJid?.[0];
      if (!target) return reply(theme.errorCard('kick', `Kis member ko nikalna hai mention karein!\nExample: \`${prefix}kick @user\``));

      try {
        await sock.groupParticipantsUpdate(from, [target], "remove");
        const card = theme.resultCard('👋', 'MEMBER EXPELLED', [
          `👤 *User:* @${target.split('@')[0]}`,
          `🛡️ *Status:* Removed from Group`,
          `⚡ *Security:* TALHA-MD Enforcer`
        ]);
        await reply(card);
      } catch (e) {
        await reply(theme.errorCard('kick', e.message));
      }
    }
  },

  promote: {
    desc: "Promote member to admin",
    category: "group",
    execute: async (sock, m, { isGroup, reply, from, isBotAdmin, isUserAdmin, isOwner, mentionedJid, getGroupInfo }) => {
      if (!isGroup) return reply(theme.errorCard('promote', "Sirf Groups me chalta hai!"));

      let bAdmin = isBotAdmin;
      let uAdmin = isUserAdmin;
      if (getGroupInfo && (!bAdmin || !uAdmin)) {
        const info = await getGroupInfo();
        bAdmin = info.isBotAdmin;
        uAdmin = info.isUserAdmin;
      }

      if (!uAdmin && !isOwner) return reply(theme.errorCard('promote', "Sirf Group Admin ya Master Talha ke liye!"));
      if (!bAdmin) return reply(theme.errorCard('promote', "Mujhe pehle Group Admin banayein!"));

      const target = mentionedJid?.[0];
      if (!target) return reply(theme.errorCard('promote', "Kisi member ko mention karein!"));

      await sock.groupParticipantsUpdate(from, [target], "promote");
      const card = theme.resultCard('👑', 'ADMIN PROMOTION', [
        `👤 *Member:* @${target.split('@')[0]}`,
        `🎖️ *New Rank:* Group Administrator`,
        `✨ *Status:* Promotion Successful! ✓`
      ], 'Mubarak ho! Zimmedari se kaam karein.');
      await reply(card);
    }
  },

  demote: {
    desc: "Demote admin to normal member",
    category: "group",
    execute: async (sock, m, { isGroup, reply, from, isBotAdmin, isUserAdmin, isOwner, mentionedJid, getGroupInfo }) => {
      if (!isGroup) return reply(theme.errorCard('demote', "Sirf Groups me!"));

      let bAdmin = isBotAdmin;
      let uAdmin = isUserAdmin;
      if (getGroupInfo && (!bAdmin || !uAdmin)) {
        const info = await getGroupInfo();
        bAdmin = info.isBotAdmin;
        uAdmin = info.isUserAdmin;
      }

      if (!uAdmin && !isOwner) return reply(theme.errorCard('demote', "Sirf Group Admin ya Owner ke liye!"));
      if (!bAdmin) return reply(theme.errorCard('demote', "Mujhe pehle Group Admin banayein!"));

      const target = mentionedJid?.[0];
      if (!target) return reply(theme.errorCard('demote', "Kisi admin ko mention karein!"));

      await sock.groupParticipantsUpdate(from, [target], "demote");
      const card = theme.resultCard('⬇️', 'ADMIN DEMOTED', [
        `👤 *User:* @${target.split('@')[0]}`,
        `🔻 *New Rank:* Standard Member`,
        `🛡️ *Status:* Admin Privileges Revoked`
      ]);
      await reply(card);
    }
  },

  link: {
    desc: "Get group invite link",
    category: "group",
    execute: async (sock, m, { isGroup, reply, from, isBotAdmin, getGroupInfo }) => {
      if (!isGroup) return reply(theme.errorCard('link', "Sirf Groups me!"));

      let bAdmin = isBotAdmin;
      if (getGroupInfo && !bAdmin) {
        const info = await getGroupInfo();
        bAdmin = info.isBotAdmin;
      }

      if (!bAdmin) return reply(theme.errorCard('link', "Mujhe pehle Group Admin banayein taake link nikal sakun!"));

      try {
        const code = await sock.groupInviteCode(from);
        const card = theme.resultCard('🔗', 'GROUP INVITATION LINK', [
          `🌐 *Invite Link:* https://chat.whatsapp.com/${code}`,
          `⚡ *Generated by:* ${config.BOT_NAME}`
        ], 'Is link se koi bhi group join kar sakta hai.');
        await reply(card);
      } catch (e) {
        await reply(theme.errorCard('link', e.message));
      }
    }
  }
};
