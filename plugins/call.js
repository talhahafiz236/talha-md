'use strict';

const os = require('os');
const config = require('../config');
const { getStr } = require('../lib/theme');

module.exports = {
    commands:    ['call', 'support', 'ownerinfo'],
    description: 'Support and owner panel',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const botName = getStr('botName') || config.BOT_NAME || 'TALHA MD';
        const pic     = config.ALIVE_IMG || getStr('pic1') || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80';

        const pkTime = new Date().toLocaleTimeString('en-US', {
            hour: 'numeric', minute: 'numeric', hour12: true, timeZone: 'Asia/Karachi'
        });
        const pkDate = new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Karachi'
        });

        const uptime  = process.uptime();
        const hours   = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);

        const sub = args[0]?.toLowerCase() || 'menu';

        if (sub === 'status') {
            return sock.sendMessage(sender, {
                text:
`🖥️ *TALHA-MD System Status*

⏰ ${pkTime} — ${pkDate}
⏳ Uptime: ${hours}h ${minutes}m ${seconds}s
💻 Platform: ${os.platform()} ${os.arch()}
🧠 Memory: ${(os.freemem() / 1048576).toFixed(0)} MB free of ${(os.totalmem() / 1048576).toFixed(0)} MB
👑 Owner: Talha Sheikh (+923426767199)`,
                contextInfo
            }, { quoted: message });
        }

        const caption =
`┌───「 ⚡ *TALHA-MD SUPPORT* 」───
│ 🤖 *Bot:* ${botName}
│ 👑 *Master:* Talha Sheikh
│ 📱 *WhatsApp:* +${config.OWNER_NUMBER || '923426767199'}
│ ⏰ *Time:* ${pkTime}
│ 📅 *Date:* ${pkDate}
└──────────────────────────────

*Direct Commands:*
• \`.owner\` → Send Owner Contact Card
• \`.ping\` → Check Response Speed
• \`.menu\` → View All Bot Commands

_⚡ TALHA-MD • Engineered for Talha Sheikh_`;

        await sock.sendMessage(sender, {
            image:   { url: pic },
            caption: caption,
            contextInfo: {
                ...contextInfo,
                externalAdReply: {
                    title: '⚡ TALHA-MD SUPPORT',
                    body: 'Contact Talha Sheikh',
                    thumbnailUrl: pic,
                    sourceUrl: `https://wa.me/${config.OWNER_NUMBER || '923426767199'}`,
                    mediaType: 1
                }
            }
        }, { quoted: message });
    }
};
