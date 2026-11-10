'use strict';
const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function downloadBuffer(mediaUrl, isVideo) {
    const res = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 45 * 1024 * 1024,
        headers: { 'User-Agent': UA, Accept: '*/*' },
        validateStatus: s => s >= 200 && s < 400,
    });
    const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
    const buf = Buffer.from(res.data || []);
    if (ctype.includes('text/html') || buf.length < 2048 || /^<(?:!doctype|html)/i.test(buf.slice(0, 64).toString('utf8'))) {
        throw new Error('Invalid or HTML response');
    }
    if (isVideo && ctype.startsWith('image/')) return { buffer: buf, isVideo: false };
    return { buffer: buf, isVideo: isVideo || ctype.includes('video/') };
}

function ytDlpThreads(url) {
    return new Promise((resolve, reject) => {
        const prefix = path.join(os.tmpdir(), `talha_th_${Date.now()}`);
        execFile('yt-dlp', ['--no-warnings', '--max-filesize', '45M', '-o', `${prefix}.%(ext)s`, url], { timeout: 45000 }, (err) => {
            const dir = path.dirname(prefix);
            const base = path.basename(prefix);
            const match = fs.readdirSync(dir).find(f => f.startsWith(base));
            if (!match) return reject(err || new Error('yt-dlp produced no file'));
            const full = path.join(dir, match);
            try {
                const buf = fs.readFileSync(full);
                const ext = path.extname(match).toLowerCase();
                if (buf.length < 2048) throw new Error('empty file');
                resolve([{ buffer: buf, isVideo: /\.(mp4|mov|webm|mkv)$/.test(ext) }]);
            } catch (e) {
                reject(e);
            } finally {
                try { fs.unlinkSync(full); } catch {}
            }
        });
    });
}

module.exports = {
    commands:    ['threads', 'threadsdl'],
    description: 'Download Threads videos and images',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const chatId = ctx.jid || ctx.sender;
        const { contextInfo } = ctx;
        const url = args[0];
        if (!url || !/threads\.(net|com)/i.test(url)) {
            return sock.sendMessage(chatId, {
                text: '❌ Please provide a valid Threads URL.\nExample: `.threads https://www.threads.net/@user/post/abc`',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Fetching Threads media...', contextInfo }, { quoted: message });

        const strategies = [
            // Strategy 1: GraphQL embed API
            async () => {
                const postId = url.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1];
                if (!postId) throw new Error('no id');
                const normalizedUrl = url.replace(/threads\.com/i, 'threads.net');
                const res = await axios.get('https://www.threads.net/api/graphql', {
                    params: {
                        lsd: 'AVqbxe3J_YA',
                        fb_api_caller_class: 'RelayModern',
                        variables: JSON.stringify({ postID: postId }),
                        server_timestamps: 'true',
                        doc_id: '7448594591874178',
                    },
                    headers: {
                        'User-Agent': UA,
                        'X-FB-LSD': 'AVqbxe3J_YA',
                        'Referer': normalizedUrl,
                    },
                    timeout: 12000,
                });
                const media = res.data?.data?.data?.edges?.[0]?.node?.thread_items?.[0]?.post?.carousel_media
                    || [res.data?.data?.data?.edges?.[0]?.node?.thread_items?.[0]?.post];
                if (!media?.length || !media[0]) throw new Error('no media');
                return media.map(m => ({
                    url:  m?.video_versions?.[0]?.url || m?.image_versions2?.candidates?.[0]?.url,
                    type: m?.video_versions?.length ? 'video' : 'image'
                })).filter(m => m.url);
            },
            // Strategy 2: rahad-all-downloader-v2
            async () => {
                const { alldl } = require('rahad-all-downloader-v2');
                const r = await alldl(url);
                const video = r?.data?.videoUrl || r?.video || r?.data?.url || r?.url;
                const img = r?.data?.image || r?.image;
                const found = video || img;
                if (!found || !/^https?:\/\//i.test(found)) throw new Error('no url');
                return [{ url: found, type: video ? 'video' : 'image' }];
            },
            // Strategy 3: yt-dlp (available in production Docker)
            () => ytDlpThreads(url),
        ];

        let items = null;
        for (const strat of strategies) {
            try {
                const result = await strat();
                if (result?.length && (result[0]?.url || result[0]?.buffer)) { items = result; break; }
            } catch {}
        }

        if (!items?.length) {
            return sock.sendMessage(chatId, {
                text:
                    `❌ *Threads Download Failed*\n\n` +
                    `Could not extract media automatically. Paste the link here:\n` +
                    `🔗 https://savethreads.io`,
                contextInfo
            }, { quoted: message });
        }

        let sentAny = false;
        for (const item of items.slice(0, 3)) {
            try {
                const media = item.buffer
                    ? { buffer: item.buffer, isVideo: Boolean(item.isVideo) }
                    : await downloadBuffer(item.url, item.type === 'video');
                await sock.sendMessage(chatId, {
                    [media.isVideo ? 'video' : 'image']: media.buffer,
                    caption: `🧵 *Threads Download*\n_Powered by TALHA MD_`,
                    contextInfo
                }, { quoted: message });
                sentAny = true;
            } catch {}
        }

        if (!sentAny) {
            await sock.sendMessage(chatId, {
                text: `❌ Could not download Threads media file. Try https://savethreads.io`,
                contextInfo
            }, { quoted: message });
        }
    }
};
