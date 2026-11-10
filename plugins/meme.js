'use strict';
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function downloadValidImage(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
        validateStatus: s => s >= 200 && s < 400,
    });
    const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
    const buf = Buffer.from(res.data || []);
    if (!buf || buf.length < 2048 || ctype.includes('text/html') || /^<(?:!doctype|html)/i.test(buf.slice(0, 64).toString('utf8'))) {
        throw new Error('Invalid image payload');
    }
    return { buffer: buf, mimetype: ctype.startsWith('image/') ? ctype.split(';')[0] : 'image/jpeg' };
}

async function getMemeApiMeme(sub) {
    const endpoint = sub
        ? `https://meme-api.com/gimme/${encodeURIComponent(sub)}`
        : 'https://meme-api.com/gimme';
    const res = await axios.get(endpoint, { timeout: 14000, headers: { 'User-Agent': 'TALHAMD-Bot/2.0' } });
    const d = res.data;
    if (!d?.url || d.nsfw) throw new Error('no sfw meme');
    return {
        url:       d.url,
        title:     d.title || 'Meme',
        author:    d.author || 'unknown',
        subreddit: d.subreddit || sub || 'memes',
        ups:       d.ups || 0,
    };
}

async function getImgflipMeme() {
    const res = await axios.get('https://api.imgflip.com/get_memes', {
        headers: { 'User-Agent': 'TALHAMD-Bot/2.0' },
        timeout: 8000,
    });
    const memes = res.data?.data?.memes;
    if (!memes?.length) throw new Error('no memes');
    return memes[Math.floor(Math.random() * Math.min(memes.length, 60))];
}

module.exports = {
    commands:    ['meme', 'memes'],
    description: 'Get a random meme image',
    usage:       '.meme [subreddit]',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = ctx.jid || ctx.sender || message.key.remoteJid;
        const sub = (args[0] || 'memes').replace(/^r\//i, '').trim();

        await sock.sendPresenceUpdate('composing', jid);

        // 1. Try meme-api.com (live SFW subreddit feed)
        try {
            const meme = await getMemeApiMeme(sub);
            const img = await downloadValidImage(meme.url);
            await sock.sendMessage(jid, {
                image:    img.buffer,
                mimetype: img.mimetype,
                caption: `😂 *${meme.title.slice(0, 150)}*\n\n👤 u/${meme.author}  •  r/${meme.subreddit}  •  👍 ${Number(meme.ups).toLocaleString()}`,
                contextInfo
            }, { quoted: message });
            return;
        } catch {}

        // 2. Fallback: Imgflip popular memes
        try {
            const meme = await getImgflipMeme();
            const img = await downloadValidImage(meme.url);
            await sock.sendMessage(jid, {
                image:    img.buffer,
                mimetype: img.mimetype,
                caption: `😂 *${meme.name}*\n\n_Template from Imgflip_`,
                contextInfo
            }, { quoted: message });
            return;
        } catch {}

        await sock.sendMessage(jid, {
            text: `😂 Couldn't fetch a meme image right now. Try again shortly.`,
            contextInfo
        }, { quoted: message });
    }
};
