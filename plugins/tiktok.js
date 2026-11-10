'use strict';

const axios = require('axios');
const qs = require('querystring');
const { execFile } = require('child_process');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const fs = require('fs');
const os = require('os');
const path = require('path');

function isHtmlFile(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(128);
        const bytes = fs.readSync(fd, buf, 0, 128, 0);
        fs.closeSync(fd);
        const head = buf.slice(0, bytes).toString('utf8').trim().toLowerCase();
        return head.startsWith('<!doctype') || head.startsWith('<html');
    } catch {
        return true;
    }
}

function tryYtDlpTikTok(url) {
    return new Promise((resolve, reject) => {
        const outPath = path.join(os.tmpdir(), `tt_ytdlp_${Date.now()}.mp4`);
        execFile('yt-dlp', [
            '--no-playlist',
            '--no-warnings',
            '-f', 'b[ext=mp4]/best',
            '--max-filesize', '50M',
            '-o', outPath,
            url,
        ], { timeout: 45000 }, (err) => {
            if (fs.existsSync(outPath) && fs.statSync(outPath).size > 2048) {
                return resolve({
                    filePath: outPath,
                    author: 'TikTok User',
                    likes: 'N/A',
                    title: 'TikTok Video',
                    source: 'yt-dlp',
                });
            }
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
            reject(err || new Error('yt-dlp TikTok failed'));
        });
    });
}

async function downloadTikTok(url) {
    // 1. Try www.tikwm.com GET & POST (fast, watermark-free, cloud-friendly)
    for (const method of ['GET', 'POST']) {
        try {
            const res = method === 'GET'
                ? await axios.get('https://www.tikwm.com/api/', {
                    params: { url },
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 18000,
                })
                : await axios.post('https://www.tikwm.com/api/', qs.stringify({ url }), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                    timeout: 18000,
                });
            const data = res.data;
            if (data?.code === 0 && data?.data?.play) {
                return {
                    videoUrl: data.data.play,
                    audioUrl: data.data.music,
                    author:   data.data.author?.nickname || data.data.author?.unique_id || 'TikTok User',
                    likes:    data.data.digg_count || 0,
                    title:    data.data.title || 'TikTok Video',
                    source:   `TikWM-${method}`
                };
            }
        } catch (e) {
            console.warn(`[TikTok] TikWM ${method} error: ${e.message}`);
        }
    }

    // 2. Try rahad-all-downloader-v2
    try {
        const { alldl } = require('rahad-all-downloader-v2');
        const r = await alldl(url);
        const vUrl = r?.data?.videoUrl || r?.data?.download?.video;
        if (vUrl) {
            return {
                videoUrl: vUrl,
                audioUrl: r?.data?.download?.audio,
                author:   r?.data?.author || 'TikTok User',
                likes:    r?.data?.likes || 'N/A',
                title:    r?.data?.title || 'TikTok Video',
                source:   'AllDL'
            };
        }
    } catch (e) {
        console.warn(`[TikTok] rahad-all-downloader error: ${e.message}`);
    }

    // 3. Try Tiklydown API
    try {
        const { data } = await axios.get(
            `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
            { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (data?.videoUrl) {
            return {
                videoUrl: data.videoUrl,
                audioUrl: data.audioUrl,
                author:   data.author?.name || 'TikTok User',
                likes:    data.stats?.digg_count || 0,
                title:    data.title || 'TikTok Video',
                source:   'Tiklydown'
            };
        }
    } catch (e) {
        console.warn(`[TikTok] Tiklydown error: ${e.message}`);
    }

    // 4. Fallback: yt-dlp (available in Docker / Render)
    try {
        return await tryYtDlpTikTok(url);
    } catch (e) {
        console.warn(`[TikTok] yt-dlp fallback error: ${e.message}`);
    }

    return null;
}

module.exports = {
    commands:    ['tiktok', 'tt', 'ttdl', 'tiktokdl'],
    description: 'Download a TikTok video without watermark',
    permission:  'public',
    group:       true,
    private:     true,
    downloadTikTok,
    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const raw = args[0];
        const url = raw?.match(/(https?:\/\/[^\s]+)/)?.[0];

        if (!url || !/tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com/.test(url)) {
            return sock.sendMessage(target, {
                text: '❌ *Invalid TikTok URL!*\n\n💡 *Example:* `.tiktok https://vt.tiktok.com/ZS...`',
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(target, {
            text: '⏳ *Processing TikTok Video...* _(Watermark-Free HD)_',
            contextInfo
        }, { quoted: message });

        const result = await downloadTikTok(url);

        if (!result || (!result.videoUrl && !result.filePath)) {
            return sock.sendMessage(target, {
                text: '❌ *Download failed.* Video may be private, region-restricted, or removed.',
                contextInfo
            }, { quoted: message });
        }

        const caption = [
            `🎵 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗧𝗜𝗞𝗧𝗢𝗞 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 *Title:* ${(result.title || 'TikTok Video').slice(0, 80)}`,
            `👤 *Author:* ${result.author || 'TikTok User'}`,
            `❤️ *Likes:* ${result.likes ?? 'N/A'}`,
            `⚡ *Source:* ${result.source}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `👑 *Owner:* Talha Sheikh`,
            `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
        ].join('\n');

        if (result.filePath) {
            try {
                await sock.sendMessage(target, {
                    video: fs.readFileSync(result.filePath),
                    mimetype: 'video/mp4',
                    caption,
                    contextInfo
                }, { quoted: message });
            } catch (e) {
                await sock.sendMessage(target, { text: `❌ *Error sending video:* ${e.message}`, contextInfo }, { quoted: message });
            } finally {
                try { if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath); } catch {}
            }
            return;
        }

        const tempPath = path.join(os.tmpdir(), `tiktok_${Date.now()}.mp4`);
        try {
            const res = await axios({
                method: 'get',
                url: result.videoUrl,
                responseType: 'stream',
                timeout: 35000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });
            const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
            if (ctype.includes('text/html') || ctype.includes('application/json')) {
                res.data.destroy?.();
                throw new Error(`Invalid video content-type: ${ctype}`);
            }
            await streamPipeline(res.data, fs.createWriteStream(tempPath));

            const stat = fs.statSync(tempPath);
            if (stat.size < 2048 || isHtmlFile(tempPath)) throw new Error('Downloaded payload is empty or HTML');

            await sock.sendMessage(target, {
                video: fs.readFileSync(tempPath),
                mimetype: 'video/mp4',
                caption,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            try {
                await sock.sendMessage(target, {
                    video:   { url: result.videoUrl },
                    caption: `🎵 *${result.title}*\n👤 ${result.author}\n\n⚡ _Downloaded by TALHA-MD_`,
                    contextInfo
                }, { quoted: message });
            } catch (e2) {
                return sock.sendMessage(target, {
                    text: `❌ *Error sending video:* ${e2.message}`,
                    contextInfo
                }, { quoted: message });
            }
        } finally {
            if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch {}
        }
    }
};
