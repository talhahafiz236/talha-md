'use strict';

const axios = require('axios');

module.exports = {
    commands:    ['pinterest', 'pindl'],
    description: 'Download Pinterest images and videos',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const url = args[0]?.match(/(https?:\/\/[^\s]+)/)?.[0] || args[0];
        if (!url || !/(?:pinterest|pin\.it)/i.test(url)) {
            return sock.sendMessage(target, {
                text: '❌ Please provide a valid Pinterest URL.\nExample: `.pinterest https://www.pinterest.com/pin/123`',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(target, { text: '⏳ Fetching Pinterest media...', contextInfo }, { quoted: message });

        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

        // Resolve pin.it shortlinks first
        let targetUrl = url;
        if (/pin\.it/i.test(url)) {
            try {
                const r = await axios.get(url, { maxRedirects: 5, timeout: 8000, headers: { 'User-Agent': UA } });
                targetUrl = r.request?.res?.responseUrl || url;
            } catch {}
        }

        const strat0 = async () => {
            const { alldl } = require('rahad-all-downloader-v2');
            const r = await alldl(targetUrl);
            const mediaUrl = r?.data?.download?.video || r?.data?.videoUrl || r?.data?.download?.image || r?.data?.url;
            if (!mediaUrl) throw new Error('no alldl url');
            return { url: mediaUrl, type: (/\.mp4/i.test(mediaUrl) || r?.data?.type === 'video') ? 'video' : 'image', title: r?.data?.title };
        };

        const strat1 = async () => {
            const res = await axios.get(
                `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(targetUrl)}`,
                { headers: { 'User-Agent': UA }, timeout: 10000 }
            );
            const d = res.data;
            const imgUrl = d?.thumbnail_url;
            if (!imgUrl) throw new Error('no thumbnail');
            return { url: imgUrl, type: 'image', title: d?.title };
        };

        const strat2 = async () => {
            const res = await axios.get(targetUrl, {
                headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
                timeout: 15000,
                maxRedirects: 5,
            });
            const html = String(res.data || '');
            const ogVid = html.match(/<meta[^>]*property=["']og:video(?::secure_url)?["'][^>]*content=["']([^"']+)["']/);
            const ogImg = html.match(/<meta[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/);
            const mp4 = html.match(/["'](https?:\/\/v\.pinimg\.com\/[^"']*\.mp4[^"']*)/);
            const mediaUrl = mp4?.[1] || ogVid?.[1];
            const imageUrl = ogImg?.[1];
            if (mediaUrl) return { url: mediaUrl, type: 'video' };
            if (imageUrl) return { url: imageUrl, type: 'image' };
            throw new Error('no media in page');
        };

        const strat3 = async () => {
            const res = await axios.post(
                'https://pinterestvideodownloader.com/download.php',
                `url=${encodeURIComponent(targetUrl)}`,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA, Referer: 'https://pinterestvideodownloader.com/' },
                    timeout: 12000,
                }
            );
            const d = res.data;
            const link = typeof d === 'string'
                ? d.match(/href=["'](https?:\/\/[^"']+\.(?:mp4|jpg|png)[^"']*)/i)?.[1]
                : d?.url || d?.link;
            if (!link) throw new Error('no link');
            return { url: link, type: /\.mp4/i.test(link) ? 'video' : 'image' };
        };

        let media = null;
        for (const strat of [strat2, strat1, strat0, strat3]) {
            try {
                const r = await strat();
                if (r?.url) { media = r; break; }
            } catch {}
        }

        if (!media?.url) {
            return sock.sendMessage(target, {
                text: `❌ *Pinterest Download Failed*\n\nEnsure the pin link is public and valid.`,
                contextInfo
            }, { quoted: message });
        }

        const isVideo = media.type === 'video';
        try {
            const dl = await axios.get(media.url, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': UA } });
            const buf = Buffer.from(dl.data);
            if (buf.length > 1024) {
                return await sock.sendMessage(target, {
                    [isVideo ? 'video' : 'image']: buf,
                    caption: `📌 *Pinterest Download*${media.title ? `\n📝 ${media.title}` : ''}\n_Powered by TALHA-MD_`,
                    contextInfo
                }, { quoted: message });
            }
            throw new Error('empty payload');
        } catch {
            try {
                await sock.sendMessage(target, {
                    [isVideo ? 'video' : 'image']: { url: media.url },
                    caption: `📌 *Pinterest Download*${media.title ? `\n📝 ${media.title}` : ''}\n_Powered by TALHA-MD_`,
                    contextInfo
                }, { quoted: message });
            } catch {
                await sock.sendMessage(target, {
                    text: `📌 *Pinterest Media Found*\n\n🔗 ${media.url}`,
                    contextInfo
                }, { quoted: message });
            }
        }
    }
};
