'use strict';

const axios = require('axios');

module.exports = {
    commands:    ['shorten', 'shorturl', 'tinyurl'],
    description: 'Shorten a URL using TinyURL / clck.ru',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const chatId = jid || sender;
        let rawUrl = (args[0] || '').trim();
        if (!rawUrl) {
            return sock.sendMessage(chatId, {
                text: '❌ Usage: `.shorten <url>`\nExample: `.shorten https://github.com/talhahafiz236/talha-md`',
                contextInfo
            }, { quoted: message });
        }
        if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;

        let shortUrl = null;
        try {
            const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(rawUrl)}`, { timeout: 15000 });
            if (typeof res.data === 'string' && /^https?:\/\//i.test(res.data.trim())) {
                shortUrl = res.data.trim();
            }
        } catch {}

        if (!shortUrl) {
            try {
                const res = await axios.get(`https://clck.ru/--?url=${encodeURIComponent(rawUrl)}`, { timeout: 15000 });
                if (typeof res.data === 'string' && /^https?:\/\//i.test(res.data.trim())) {
                    shortUrl = res.data.trim();
                }
            } catch {}
        }

        if (shortUrl) {
            return sock.sendMessage(chatId, {
                text: `🔗 *Shortened URL*\n\n📎 *Original:* ${rawUrl}\n✅ *Short:* ${shortUrl}`,
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: '❌ Failed to shorten URL. Please make sure the URL is valid.',
            contextInfo
        }, { quoted: message });
    }
};
