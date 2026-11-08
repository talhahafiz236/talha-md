'use strict';

const os      = require('os');
const config  = require('../config');
const { performance } = require('perf_hooks');
const { getActiveTheme } = require('../lib/theme');
const moment  = require('moment-timezone');

const TZ = 'Asia/Karachi';

module.exports = {
    commands:    ['alive', 'bot', 'botinfo'],
    description: 'Show bot status with full theme styling',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { safeSend, contextInfo } = ctx;
        const t = getActiveTheme()?.global || {};

        const start = performance.now();
        const ping  = (performance.now() - start).toFixed(1);

        const upRaw = process.uptime();
        const h = Math.floor(upRaw / 3600);
        const m = Math.floor((upRaw % 3600) / 60);
        const s = Math.floor(upRaw % 60);
        const uptime = `${h}h ${m}m ${s}s`;

        const totalRam = (os.totalmem() / 1073741824).toFixed(2);
        const usedRam  = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);

        const mode   = (config.MODE || 'PUBLIC').toUpperCase();
        const owner  = config.OWNER_NUMBER || global.botNum || 'Unknown';
        const prefix = config.PREFIX || '.';
        const theme  = (config.THEME || 'talha').toLowerCase();

        const now    = moment().tz(TZ);
        const date   = now.format('ddd, DD MMM YYYY');
        const time   = now.format('hh:mm A');

        const botName  = 'TALHA-MD';
        const fs = require('fs');
        const path = require('path');
        const localHero = path.join(__dirname, '../assets/talha_md_hero.jpg');
        const imageUrl = fs.existsSync(localHero) ? localHero : (config.ALIVE_IMG || t.pic1 || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80');

        const caption =
`⚡ *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗜𝗦 𝗢𝗡𝗟𝗜𝗡𝗘* ⚡

╭━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╮
│ 🤖 *𝗕𝗼𝘁:*       TALHA-MD v2.0
│ 👑 *𝗢𝘄𝗻𝗲𝗿:*     Talha Sheikh (+923426767199)
│ ⏱️ *𝗨𝗽𝘁𝗶𝗺𝗲:*    ${uptime}
│ ⚡ *𝗟𝗮𝘁𝗲𝗻𝗰𝘆:*   ${ping} ms
│ 💾 *𝗥𝗔𝗠 𝗨𝘀𝗮𝗴𝗲:* ${usedRam} / ${totalRam} GB
│ 🌐 *𝗠𝗼𝗱𝗲:*      ${mode}
│ ⌨️  *𝗣𝗿𝗲𝗳𝗶𝘅:*     \`${prefix}\`
│ 📅 *𝗗𝗮𝘁𝗲:*      ${date}
│ 🕒 *𝗧𝗶𝗺𝗲:*      ${time} PKT
╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯

❝ *Your Smart, Multi-Functional WhatsApp Assistant is Ready to Serve!* ❞

📢 *Official Channel:*
https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`;

        try {
            const imgPayload = (typeof imageUrl === 'string' && fs.existsSync(imageUrl))
                ? { image: fs.readFileSync(imageUrl) }
                : { image: { url: imageUrl } };
            await safeSend({ ...imgPayload, caption, contextInfo }, { quoted: message });
        } catch {
            await safeSend({ text: caption, contextInfo }, { quoted: message });
        }
    }
};
