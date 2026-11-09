'use strict';

const moment = require('moment-timezone');
const config = require('../config');

module.exports = {
    commands:    ['repo', 'repository', 'github', 'sc'],
    description: 'Show TALHA MD repository and bot info',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = message.key.remoteJid;

        const caption = 
            `┌───「 ⚡ *TALHA-MD BOT REPOSITORY* 」───\n` +
            `│ 🤖 *Bot Name:* ${config.BOT_NAME || 'TALHA MD'}\n` +
            `│ 👑 *Creator:* ${config.OWNER_NAME || 'Talha Sheikh'}\n` +
            `│ 📱 *Owner WA:* +${config.OWNER_NUMBER || '923426767199'}\n` +
            `│ 📢 *Channel:* ${config.CHANNEL_URL || 'https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S'}\n` +
            `│ ⚡ *Version:* 2.0.0 (High-Speed Neural Engine)\n` +
            `│ 📦 *Plugins:* 150+ Full Power Modules\n` +
            `│ 🔒 *Mode:* ${(config.MODE || 'public').toUpperCase()}\n` +
            `│ 🌐 *License:* Apache 2.0 (Open Source)\n` +
            `└──────────────────────────────────────\n\n` +
            `_⚡ Designed and Maintained Exclusively for Talha Sheikh_`;

        await sock.sendMessage(jid, {
            text: caption,
            contextInfo: {
                ...contextInfo,
                externalAdReply: {
                    title: '⚡ TALHA-MD OFFICIAL CHANNEL',
                    body: 'Tap to join Talha Sheikh\'s WhatsApp Channel',
                    thumbnailUrl: config.ALIVE_IMG || 'https://files.catbox.moe/cpm6od.jpg',
                    sourceUrl: config.CHANNEL_URL || 'https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: message });
    }
};
