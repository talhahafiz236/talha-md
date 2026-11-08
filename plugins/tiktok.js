'use strict';

const axios    = require('axios');
const qs       = require('querystring');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const fs       = require('fs');
const os       = require('os');
const path     = require('path');

async function downloadTikTok(url) {
    // 1. Try TikWM via POST (form-urlencoded) - tested & high reliability
    try {
        const res = await axios.post(
            'https://tikwm.com/api/',
            qs.stringify({ url }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 25000
            }
        );
        const data = res.data;
        if (data?.code === 0 && data?.data?.play) {
            return {
                videoUrl: data.data.play,
                audioUrl: data.data.music,
                author:   data.data.author?.nickname || data.data.author?.unique_id || 'TikTok User',
                likes:    data.data.digg_count || 0,
                title:    data.data.title || 'TikTok Video',
                source:   'TikWM'
            };
        }
    } catch (e) {
        console.warn(`[TikTok] TikWM POST error: ${e.message}`);
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

    return null;
}

module.exports = {
    commands:    ['tiktok', 'tt', 'ttdl', 'tiktokdl'],
    description: 'Download a TikTok video without watermark',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { sender, contextInfo }) => {
        const raw = args[0];
        const url = raw?.match(/(https?:\/\/[^\s]+)/)?.[0];

        if (!url || !/tiktok\.com|vt\.tiktok\.com/.test(url)) {
            return sock.sendMessage(sender, {
                text: '❌ *Invalid TikTok URL!*\n\n💡 *Example:* `.tiktok https://vt.tiktok.com/ZS...`',
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(sender, {
            text: '⏳ *Processing TikTok Video...* _(Watermark-Free HD)_',
            contextInfo
        }, { quoted: message });

        const result = await downloadTikTok(url);

        if (!result || !result.videoUrl) {
            return sock.sendMessage(sender, {
                text: '❌ *Download failed.* Video may be private, region-restricted, or removed.',
                contextInfo
            }, { quoted: message });
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
            await streamPipeline(res.data, fs.createWriteStream(tempPath));

            const stat = fs.statSync(tempPath);
            if (stat.size < 1024) throw new Error('Downloaded file too small');

            const caption = [
                `🎵 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗧𝗜𝗞𝗧𝗢𝗞 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `📝 *Title:* ${result.title.slice(0, 80)}`,
                `👤 *Author:* ${result.author}`,
                `❤️ *Likes:* ${result.likes}`,
                `⚡ *Source:* ${result.source}`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `👑 *Owner:* Talha Sheikh`,
                `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
            ].join('\n');

            await sock.sendMessage(sender, {
                video:   fs.readFileSync(tempPath),
                caption: caption,
                contextInfo
            }, { quoted: message });

        } catch (e) {
            // Direct stream fallback if pipe fails
            try {
                await sock.sendMessage(sender, {
                    video:   { url: result.videoUrl },
                    caption: `🎵 *${result.title}*\n👤 ${result.author}\n\n⚡ _Downloaded by TALHA-MD_`,
                    contextInfo
                }, { quoted: message });
            } catch (e2) {
                return sock.sendMessage(sender, {
                    text: `❌ *Error sending video:* ${e2.message}`,
                    contextInfo
                }, { quoted: message });
            }
        } finally {
            if (fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        }
    }
};
