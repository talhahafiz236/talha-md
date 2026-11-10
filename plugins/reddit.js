'use strict';
const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function ytDlpReddit(url) {
    return new Promise((resolve, reject) => {
        const prefix = path.join(os.tmpdir(), `talha_rd_${Date.now()}`);
        execFile('yt-dlp', ['-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--no-warnings', '--max-filesize', '45M', '-o', `${prefix}.%(ext)s`, url], { timeout: 45000 }, (err) => {
            const dir = path.dirname(prefix);
            const base = path.basename(prefix);
            const match = fs.readdirSync(dir).find(f => f.startsWith(base));
            if (!match) return reject(err || new Error('yt-dlp failed'));
            const full = path.join(dir, match);
            try {
                const buf = fs.readFileSync(full);
                if (buf.length < 2048) throw new Error('empty');
                resolve({ buffer: buf, isVideo: /\.(mp4|mov|webm|mkv)$/i.test(match) });
            } catch (e) {
                reject(e);
            } finally {
                try { fs.unlinkSync(full); } catch {}
            }
        });
    });
}

module.exports = {
    commands:    ['reddit', 'rdl'],
    description: 'Download Reddit images and videos',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const chatId = jid || sender;
        const url = args[0];
        if (!url || !/reddit\.com|redd\.it/i.test(url)) {
            return sock.sendMessage(chatId, {
                text: '❌ Please provide a valid Reddit URL.\nExample: .reddit https://reddit.com/r/sub/comments/abc/title/',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Fetching Reddit media...', contextInfo }, { quoted: message });

        // 1. Try yt-dlp first (merges video+audio cleanly on Reddit DASH streams)
        try {
            const dl = await ytDlpReddit(url);
            return await sock.sendMessage(chatId, {
                [dl.isVideo ? 'video' : 'image']: dl.buffer,
                caption: `📤 *Reddit Download*\n_Powered by TALHA MD_`,
                contextInfo
            }, { quoted: message });
        } catch {}

        // 2. Try Reddit JSON API
        try {
            const cleanUrl = url.split('?')[0].replace(/\/?$/, '');
            const jsonUrl = `${cleanUrl}.json`;
            const { data } = await axios.get(jsonUrl, {
                timeout: 15000,
                headers: { 'User-Agent': 'node:talhamd:v2.0 (by /u/talha)' }
            });
            const post = data?.[0]?.data?.children?.[0]?.data;
            if (!post) throw new Error('Could not fetch post data.');
            const title = post.title || 'Reddit Post';
            if (post.is_video && post.media?.reddit_video?.fallback_url) {
                const videoUrl = post.media.reddit_video.fallback_url.split('?')[0];
                const vRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
                return await sock.sendMessage(chatId, {
                    video: Buffer.from(vRes.data),
                    caption: `📤 *${title}*\n👍 ${post.ups} upvotes\n_Powered by TALHA MD_`,
                    contextInfo
                }, { quoted: message });
            } else if (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
                const iRes = await axios.get(post.url, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
                return await sock.sendMessage(chatId, {
                    image: Buffer.from(iRes.data),
                    caption: `📤 *${title}*\n👍 ${post.ups} upvotes\n_Powered by TALHA MD_`,
                    contextInfo
                }, { quoted: message });
            } else {
                return await sock.sendMessage(chatId, {
                    text: `📤 *${title}*\n\n${post.selftext ? post.selftext.slice(0, 1000) : '(no text)'}\n\n👍 ${post.ups} upvotes`,
                    contextInfo
                }, { quoted: message });
            }
        } catch {}

        // 3. Fallback: rahad-all-downloader-v2
        try {
            const { alldl } = require('rahad-all-downloader-v2');
            const r = await alldl(url);
            const mediaUrl = r?.data?.videoUrl || r?.video || r?.data?.url || r?.url;
            if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) {
                const mRes = await axios.get(mediaUrl, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': UA } });
                const buf = Buffer.from(mRes.data);
                if (buf.length > 2048) {
                    const isImg = /\.(jpg|jpeg|png|webp)$/i.test(mediaUrl);
                    return await sock.sendMessage(chatId, {
                        [isImg ? 'image' : 'video']: buf,
                        caption: `📤 *Reddit Download*\n_Powered by TALHA MD_`,
                        contextInfo
                    }, { quoted: message });
                }
            }
        } catch {}

        await sock.sendMessage(chatId, { text: `❌ Reddit fetch failed. Try copying the direct post URL.`, contextInfo }, { quoted: message });
    }
};
