'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { getStr } = require('../lib/theme');

module.exports = {
    commands:    ['uptime', 'runtime'],
    description: 'Show bot uptime and system stats',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        try {
            const botName = getStr('botName') || 'TALHA MD';
            const pic     = getStr('pic3') || 'https://files.catbox.moe/ncgbn5.jpg';

            const uptime  = process.uptime();
            const h = Math.floor(uptime / 3600);
            const m = Math.floor((uptime % 3600) / 60);
            const s = Math.floor(uptime % 60);

            const cpu      = os.cpus()[0]?.model || 'Unknown CPU';
            const platform = os.platform().toUpperCase();
            const totalMem = (os.totalmem() / 1073741824).toFixed(2);
            const freeMem  = (os.freemem()  / 1073741824).toFixed(2);
            const latency  = message.messageTimestamp
                ? Date.now() - message.messageTimestamp * 1000 : 0;

            const caption =
`┏━━━━━━━━━━━━━━━┓
      ✦ *${botName} Runtime* ✦
┗━━━━━━━━━━━━━━━┛

🕒 *Uptime:* ${h}h ${m}m ${s}s
⚡ *Latency:* ${latency} ms
🖥 *CPU:* ${cpu}
🏗 *Platform:* ${platform}
🛠 *RAM:* ${freeMem} GB / ${totalMem} GB

✨ _Powered by ${botName}_`;

            const localHero = path.join(__dirname, '../assets/talha_md_welcome.jpg');
            const heroBuffer = fs.existsSync(localHero) ? fs.readFileSync(localHero) : null;
            const imgPayload = heroBuffer ? { image: heroBuffer } : { image: { url: pic } };

            await sock.sendMessage(sender, {
                ...imgPayload,
                caption,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[Uptime]', err.message);
            await sock.sendMessage(sender, {
                text: '⚠️ Failed to fetch runtime details.',
                contextInfo
            }, { quoted: message });
        }
    }
};
