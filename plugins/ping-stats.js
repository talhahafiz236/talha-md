'use strict';

const { performance } = require('perf_hooks');
const os = require('os');
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
        await safeSend({ text: '🏓 _Pinging..._' }, { quoted: message });
        const ms = (performance.now() - start).toFixed(2);

        const uptime = process.uptime();
        const h = Math.floor(uptime / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = Math.floor(uptime % 60);

        const totalRam = os.totalmem() / 1073741824;
        const usedRam = (os.totalmem() - os.freemem()) / 1073741824;
        const botName = getStr('botName') || config.BOT_NAME || 'TALHA MD';
        const imageUrl = getStr('pic1') || config.ALIVE_IMG || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80';
        const caption = [
            `⚡ *${botName}*`,
            '',
            `🏓 *Ping:* ${ms} ms 🟢`,
            `⏱️ *Uptime:* ${h}h ${m}m ${s}s`,
            `🖥️ *CPU:* ${os.cpus().length} cores`,
            `💾 *RAM:* ${usedRam.toFixed(2)} GB / ${totalRam.toFixed(2)} GB (${((usedRam / totalRam) * 100).toFixed(1)}%)`,
            `📦 *Commands:* ${global.plugins?.flatMap?.(p => p.commands || []).length || '535+'}`,
            '',
            `_${config.MODE || 'public'} mode • TALHA MD Core_`,
            '',
            `📦 ${config.PREFIX || '.'}menu  •  📊 ${config.PREFIX || '.'}uptime  •  🧠 ${config.PREFIX || '.'}gemini`,
        ].join('\n');

        await safeSend({ image: { url: imageUrl }, caption, contextInfo }, { quoted: message });
    }
};
