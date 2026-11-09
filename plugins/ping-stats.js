'use strict';

const { performance } = require('perf_hooks');
const os = require('os');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getStr } = require('../lib/theme');


module.exports = {
    commands:    ['ping'],
    description: 'Check bot response time and uptime',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
        const start = performance.now();
        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = Math.floor(uptime % 60);

        const totalRam = os.totalmem() / 1073741824;
        const usedRam = (os.totalmem() - os.freemem()) / 1073741824;
        const botName = getStr('botName') || config.BOT_NAME || 'TALHA MD';
        const localHero = path.join(__dirname, '../assets/talha_md_card.jpg');
        const heroBuffer = fs.existsSync(localHero) ? fs.readFileSync(localHero) : null;
        const imageUrl = getStr('pic2') || config.ALIVE_IMG || 'https://files.catbox.moe/ie7zbn.jpg';
        const imgPayload = heroBuffer ? { image: heroBuffer } : { image: { url: imageUrl } };
        const ms = (performance.now() - start + 45).toFixed(2);
        const caption = [
            `⚡ *${botName}*`,
            '',
            `🏓 *Response Speed:* ${ms} ms 🟢`,
            `⏱️ *Uptime:* ${h}h ${m}m ${s}s`,
            `🖥️ *CPU:* ${os.cpus().length} cores`,
            `💾 *RAM:* ${usedRam.toFixed(2)} GB / ${totalRam.toFixed(2)} GB (${((usedRam / totalRam) * 100).toFixed(1)}%)`,
            `📦 *Commands:* ${global.plugins?.flatMap?.(p => p.commands || []).length || '535+'}`,
            '',
            `_${config.MODE || 'public'} mode • TALHA MD Core_`,
            '',
            `📦 ${config.PREFIX || '.'}menu  •  📊 ${config.PREFIX || '.'}uptime  •  🧠 ${config.PREFIX || '.'}gemini`,
        ].join('\n');

        await safeSend({ ...imgPayload, caption, contextInfo }, { quoted: message });
    }
};
