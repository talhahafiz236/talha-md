'use strict';

const axios = require('axios');

const UA = 'TALHAMD-Bot/2.0';
const DIRECT_ENDPOINTS = new Set(['waifu', 'neko', 'husbando', 'kitsune']);

const DESCRIPTIONS = {
    waifu:    '🌸 Waifu time!',
    neko:     '🐱 Neko!',
    maid:     '🧹 Maid-sama!',
    uniform:  '🎓 School uniform!',
    selfies:  '📸 Anime selfie!',
    raiden:   '⚡ Raiden Shogun!',
    rias:     '😈 Rias Gremory!',
    kamisato: '❄️ Kamisato Ayaka!',
    husbando: '💪 Husbando!',
    shinobu:  '🦋 Shinobu!',
    megumin:  '💥 Megumin!',
    kitsune:  '🦊 Kitsune!',
};

async function fetchNekosBestImage(tag) {
    if (DIRECT_ENDPOINTS.has(tag)) {
        const resp = await axios.get(`https://nekos.best/api/v2/${tag}`, {
            headers: { 'User-Agent': UA },
            timeout: 12000,
        });
        const item = resp.data?.results?.[0];
        if (item?.url) return { url: item.url, source: item.source_url || null, artist: item.artist_name || null };
    }

    try {
        const searchResp = await axios.get('https://nekos.best/api/v2/search', {
            params: { query: tag, type: 1 },
            headers: { 'User-Agent': UA },
            timeout: 12000,
        });
        const results = Array.isArray(searchResp.data?.results) ? searchResp.data.results : [];
        if (results.length) {
            const pick = results[Math.floor(Math.random() * results.length)];
            if (pick?.url) return { url: pick.url, source: pick.source_url || null, artist: pick.artist_name || null };
        }
    } catch {}

    // Reliable fallback to waifu/neko category on nekos.best
    const fallbackType = tag === 'neko' ? 'neko' : tag === 'husbando' ? 'husbando' : tag === 'kitsune' ? 'kitsune' : 'waifu';
    const resp = await axios.get(`https://nekos.best/api/v2/${fallbackType}`, {
        headers: { 'User-Agent': UA },
        timeout: 12000,
    });
    const item = resp.data?.results?.[0];
    if (!item?.url) throw new Error('No anime image returned');
    return { url: item.url, source: item.source_url || null, artist: item.artist_name || null };
}

module.exports = {
    commands:   ['waifu', 'neko', 'kitsune', 'maid', 'husbando', 'shinobu', 'megumin',
                 'uniform', 'selfies', 'raiden', 'rias', 'kamisato'],
    description: 'Anime girl/guy images — waifu, neko, kitsune, maid, husbando, shinobu, megumin, raiden, rias, kamisato',
    usage:      '.waifu | .neko | .kitsune | .maid | .husbando | .shinobu | .megumin',
    permission: 'public',
    group:      true,
    private:    true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = ctx.jid || ctx.sender || message.key.remoteJid;

        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();

        const label = DESCRIPTIONS[rawCmd] || '🌸 Waifu!';

        try {
            await sock.sendPresenceUpdate('composing', jid);
            const { url: imageUrl, source: sourceUrl, artist } = await fetchNekosBestImage(rawCmd);

            const imgResp = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                headers: { 'User-Agent': UA },
                timeout: 15000,
            });
            const buf = Buffer.from(imgResp.data || []);
            if (buf.length < 1024) throw new Error('Invalid image payload');

            const extra = [artist ? `🎨 Artist: ${artist}` : null, sourceUrl ? `🔗 ${sourceUrl}` : null]
                .filter(Boolean).join('\n');
            const caption = extra ? `${label}\n\n${extra}` : label;

            await sock.sendMessage(jid, {
                image:   buf,
                caption,
                contextInfo
            }, { quoted: message });

        } catch (e) {
            await sock.sendMessage(jid, {
                text: `❌ Failed to fetch image: ${e.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
