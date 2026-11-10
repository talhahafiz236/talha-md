'use strict';
const axios = require('axios');
const { gifToMp4 } = require('../lib/dlmedia');

const UA = 'TALHAMD-Bot/2.0';

async function searchGifUrl(query) {
    // 1. nekos.best anime GIF search (works without API key)
    try {
        const res = await axios.get('https://nekos.best/api/v2/search', {
            params: { query, type: 2 },
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });
        const results = Array.isArray(res.data?.results) ? res.data.results : [];
        if (results.length) {
            const pick = results[Math.floor(Math.random() * results.length)];
            if (pick?.url) return { url: pick.url, isGif: true };
        }
    } catch {}

    // 2. Direct nekos.best reaction endpoint if single keyword matches
    const single = query.toLowerCase().trim().split(/\s+/)[0];
    try {
        const res = await axios.get(`https://nekos.best/api/v2/${encodeURIComponent(single)}`, {
            headers: { 'User-Agent': UA },
            timeout: 8000,
        });
        const u = res.data?.results?.[0]?.url;
        if (u) return { url: u, isGif: u.endsWith('.gif') };
    } catch {}

    // 3. otakugifs reaction fallback
    try {
        const res = await axios.get('https://api.otakugifs.xyz/gif', {
            params: { reaction: single },
            headers: { 'User-Agent': UA },
            timeout: 8000,
        });
        if (res.data?.url) return { url: res.data.url, isGif: true };
    } catch {}

    // 4. Cat GIF fallback if searching cats
    if (/cat|kitty|kitten/i.test(query)) {
        try {
            const res = await axios.get('https://api.thecatapi.com/v1/images/search?mime_types=gif', { timeout: 8000 });
            if (res.data?.[0]?.url) return { url: res.data[0].url, isGif: true };
        } catch {}
    }

    // 5. Fallback: generate custom sticker image via Pollinations
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`cute expressive sticker illustration of ${query}, transparent style white border`)}?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`;
    return { url: imgUrl, isGif: false };
}

module.exports = {
    commands:    ['stickersearch', 'findsticker', 'giphy'],
    description: 'Search and send animated GIFs or sticker art',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, sender, groupId, contextInfo }) => {
        const chatId = jid || groupId || sender;
        const query  = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, {
                text: '🔍 Usage: `.stickersearch <query>`\nExample: `.stickersearch happy hug`',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: `⏳ Searching stickers/GIFs for "${query}"...`, contextInfo }, { quoted: message });
        try {
            const found = await searchGifUrl(query);
            const { data, headers } = await axios.get(found.url, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': UA },
                timeout: 25000,
            });
            const buf = Buffer.from(data || []);
            if (buf.length < 1024) throw new Error('Empty media response');
            const ctype = String(headers?.['content-type'] || '').toLowerCase();

            if (found.isGif || ctype.includes('image/gif')) {
                const mp4Buf = await gifToMp4(buf);
                return await sock.sendMessage(chatId, {
                    video: mp4Buf,
                    gifPlayback: true,
                    mimetype: 'video/mp4',
                    caption: `🎭 *${query}* — TALHA MD`,
                    contextInfo,
                }, { quoted: message });
            }

            await sock.sendMessage(chatId, {
                image: buf,
                caption: `🎭 *${query}* — TALHA MD`,
                contextInfo,
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ Sticker search failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};
