'use strict';

const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function expandShortUrl(url) {
    if (!/t\.co\//i.test(url)) return url;
    try {
        const res = await axios.get(url, {
            maxRedirects: 5,
            timeout: 8000,
            headers: { 'User-Agent': 'TALHAMD-Bot/2.0' },
        });
        return res.request?.res?.responseUrl || url;
    } catch {
        return url;
    }
}

function tryYtDlpTwitter(url) {
    return new Promise((resolve, reject) => {
        const outPath = path.join(os.tmpdir(), `tw_ytdlp_${Date.now()}.mp4`);
        execFile('yt-dlp', [
            '--no-playlist',
            '--no-warnings',
            '-f', 'b[ext=mp4]/best',
            '--max-filesize', '50M',
            '-o', outPath,
            url,
        ], { timeout: 45000 }, (err) => {
            if (fs.existsSync(outPath) && fs.statSync(outPath).size > 2048) {
                return resolve([{ filePath: outPath, type: 'video' }]);
            }
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
            reject(err || new Error('yt-dlp twitter failed'));
        });
    });
}

async function resolveTwitterMedia(rawUrl) {
    const url = await expandShortUrl(rawUrl);
    const match = url.match(/(?:twitter\.com|x\.com)\/([^/?#]+)\/status\/(\d+)/i);

    const strategies = [];
    if (match) {
        const [, username, tweetId] = match;
        strategies.push(async () => {
            const res = await axios.get(
                `https://api.vxtwitter.com/${username}/status/${tweetId}`,
                { headers: { 'User-Agent': 'TALHAMD-Bot/2.0' }, timeout: 12000 }
            );
            const d = res.data;
            const media = d?.media_extended || d?.mediaURLs?.map(u => ({ url: u }));
            if (!media?.length) throw new Error('no media');
            return media.map(m => ({
                url:  m.url || m.video_url,
                type: (m.type === 'video' || (m.url || '').includes('.mp4')) ? 'video' : 'image',
            })).filter(m => m.url);
        });
        strategies.push(async () => {
            const res = await axios.get(
                `https://api.fxtwitter.com/${username}/status/${tweetId}`,
                { headers: { 'User-Agent': 'TALHAMD-Bot/2.0' }, timeout: 12000 }
            );
            const tweet = res.data?.tweet;
            const media = tweet?.media?.all || tweet?.media?.videos || tweet?.media?.images;
            if (!media?.length) throw new Error('no media');
            return media.map(m => ({
                url:  m.url || m.thumbnail_url,
                type: (m.type === 'video') ? 'video' : 'image',
            })).filter(m => m.url);
        });
    }
    strategies.push(() => tryYtDlpTwitter(url));

    for (const strat of strategies) {
        try {
            const res = await strat();
            if (res?.length && (res[0].url || res[0].filePath)) return { items: res, tweetId: match?.[2] || Date.now() };
        } catch {}
    }
    return null;
}

module.exports = {
    commands:    ['twitter', 'xdl', 'twdl', 'tw'],
    description: 'Download Twitter/X videos and images',
    permission:  'public',
    group:       true,
    private:     true,
    resolveTwitterMedia,

    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const raw = args[0];
        const url = raw?.match(/(https?:\/\/[^\s]+)/)?.[0];
        if (!url || !/twitter\.com|x\.com|t\.co/i.test(url)) {
            return sock.sendMessage(target, {
                text: '❌ Please provide a valid Twitter/X URL.\nExample: `.tw https://x.com/user/status/123`',
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(target, { text: '⏳ Fetching Twitter/X media...', contextInfo }, { quoted: message });

        const resolved = await resolveTwitterMedia(url);
        if (!resolved?.items?.length) {
            return sock.sendMessage(target, {
                text: `❌ *Twitter/X download failed*\n\nThe post may have no media, be protected, or be age-restricted.`,
                contextInfo
            }, { quoted: message });
        }

        for (const item of resolved.items.slice(0, 3)) {
            if (item.filePath) {
                try {
                    await sock.sendMessage(target, {
                        video: fs.readFileSync(item.filePath),
                        mimetype: 'video/mp4',
                        caption: `🐦 *Twitter/X Download*\n_Powered by TALHA-MD_`,
                        contextInfo
                    }, { quoted: message });
                } finally {
                    try { if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath); } catch {}
                }
                continue;
            }

            const isVideo = item.type === 'video';
            try {
                await sock.sendMessage(target, {
                    [isVideo ? 'video' : 'image']: { url: item.url },
                    caption: `🐦 *Twitter/X Download*\n_Powered by TALHA-MD_`,
                    contextInfo
                }, { quoted: message });
            } catch {
                if (isVideo) {
                    await sock.sendMessage(target, {
                        document: { url: item.url },
                        mimetype: 'video/mp4',
                        fileName: `twitter_${resolved.tweetId}.mp4`,
                        contextInfo
                    }, { quoted: message }).catch(() => {});
                }
            }
        }
    }
};
