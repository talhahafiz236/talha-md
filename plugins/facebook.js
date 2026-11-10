'use strict';

const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// ─── Strategy 1: fb-downloader-scrapper (verified live package) ───────────────
async function tryFbScrapper(url) {
    const { getFbVideoInfo } = require('fb-downloader-scrapper');
    const info = await getFbVideoInfo(url);
    const chosen = info?.hd || info?.sd;
    if (!chosen) throw new Error('fb-downloader-scrapper returned no URL');
    return {
        videoUrl: chosen,
        title: info.title || 'Facebook Video',
        quality: info.hd ? 'HD' : 'SD',
        source: 'FbScrapper',
    };
}

// ─── Strategy 2: rahad-all-downloader-v2 ──────────────────────────────────────
async function tryAllDl(url) {
    const { alldl } = require('rahad-all-downloader-v2');
    const r = await alldl(url);
    const v = r?.data?.videoUrl || r?.data?.download?.video || r?.data?.url;
    if (v) {
        return {
            videoUrl: v,
            title: r.data?.title || 'Facebook Video',
            quality: 'HD',
            source: 'AllDL'
        };
    }
    throw new Error('AllDL: no video URL');
}

// ─── Strategy 3: yt-dlp (local / Docker) ──────────────────────────────────────
function tryYtDlp(url) {
    return new Promise((resolve, reject) => {
        const outPath = path.join(os.tmpdir(), `fb_ytdlp_${Date.now()}.mp4`);
        execFile('yt-dlp', [
            '--no-playlist',
            '--no-warnings',
            '-f', 'b[ext=mp4]/best',
            '--max-filesize', '50M',
            '-o', outPath,
            url,
        ], { timeout: 50000 }, (err) => {
            if (fs.existsSync(outPath) && fs.statSync(outPath).size > 4096) {
                return resolve({
                    filePath: outPath,
                    title: 'Facebook Video',
                    quality: 'HD',
                    source: 'yt-dlp',
                });
            }
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
            reject(err || new Error('yt-dlp: no file'));
        });
    });
}

// ─── Strategy 4: snapsave.app ─────────────────────────────────────────────────
async function trySnapsave(url) {
    const r1 = await axios.get('https://snapsave.app/', {
        headers: { 'User-Agent': UA },
        timeout: 12000,
    });
    const cookies = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    const r2 = await axios.post('https://snapsave.app/action.php',
        new URLSearchParams({ url }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies,
                'Referer': 'https://snapsave.app/',
                'Origin': 'https://snapsave.app',
                'User-Agent': UA,
            },
            timeout: 18000,
        }
    );
    const raw = typeof r2.data === 'string' ? r2.data : JSON.stringify(r2.data);
    if (raw.includes('Unable to connect') || raw.includes('error_api')) throw new Error('snapsave: blocked');

    let decoded = raw;
    try {
        const holder = { val: '' };
        const patched = raw.replace(/\beval\s*\(/, 'holder.val=(');
        new Function('holder', patched)(holder);
        if (holder.val) decoded = holder.val;
    } catch (_) {}

    const hd  = decoded.match(/href=["'](https?:\/\/[^"']*video[^"']*)["'][^>]*>\s*(?:HD|High)/i);
    const sd  = decoded.match(/href=["'](https?:\/\/[^"']*video[^"']*)["'][^>]*>\s*(?:SD|Normal)/i);
    const any = decoded.match(/href=["'](https?:\/\/[^"']*(?:fbcdn|facebook)[^"']*\.mp4[^"']*)["']/i);
    const videoUrl = hd?.[1] || sd?.[1] || any?.[1];
    if (!videoUrl) throw new Error('snapsave: no video url found');
    return { videoUrl: videoUrl.replace(/&amp;/g, '&'), title: 'Facebook Video', quality: hd ? 'HD' : 'SD', source: 'SnapSave' };
}

// ─── Strategy 5: fdown.net ────────────────────────────────────────────────────
async function tryFdown(url) {
    const r = await axios.post('https://fdown.net/search.php',
        new URLSearchParams({ URLz: url }).toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://fdown.net/',
                'Origin': 'https://fdown.net',
                'User-Agent': UA,
            },
            timeout: 18000,
        }
    );
    const html = typeof r.data === 'string' ? r.data : '';
    const hd  = html.match(/id=["']?hdlink["']?[^>]*href=["']([^"']+)["']/i);
    const sd  = html.match(/id=["']?sdlink["']?[^>]*href=["']([^"']+)["']/i);
    const any = html.match(/href=["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
    const videoUrl = hd?.[1] || sd?.[1] || any?.[1];
    if (!videoUrl) throw new Error('fdown: no video url');
    return { videoUrl: videoUrl.replace(/&amp;/g, '&'), title: 'Facebook Video', quality: hd ? 'HD' : 'SD', source: 'Fdown' };
}

async function resolveFacebook(url) {
    const STRATEGIES = [
        { name: 'FbScrapper', fn: () => tryFbScrapper(url) },
        { name: 'AllDL',      fn: () => tryAllDl(url) },
        { name: 'yt-dlp',     fn: () => tryYtDlp(url) },
        { name: 'SnapSave',   fn: () => trySnapsave(url) },
        { name: 'FDown',      fn: () => tryFdown(url) },
    ];
    for (const s of STRATEGIES) {
        try {
            const result = await s.fn();
            if (result?.videoUrl || result?.filePath) return result;
        } catch (e) {
            console.warn(`[FB] ${s.name} failed: ${e.message}`);
        }
    }
    return null;
}

module.exports = {
    commands:    ['facebook', 'fb', 'fbdl', 'fbvideo'],
    description: 'Download Facebook videos and reels (HD/SD)',
    permission:  'public',
    group:       true,
    private:     true,
    resolveFacebook,

    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const raw = args[0];
        const url = raw?.match(/(https?:\/\/[^\s]+)/)?.[0];

        if (!url || !/(?:facebook\.com|fb\.watch|fb\.com)/.test(url)) {
            return sock.sendMessage(target, {
                text: '❌ *Invalid Facebook URL!*\n\n💡 *Example:* `.fb https://fb.watch/xyz` or `facebook.com/reel/...`',
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(target, {
            text: '⏳ *Fetching Facebook Video...* _(High Quality)_',
            contextInfo
        }, { quoted: message });

        const result = await resolveFacebook(url);

        if (!result || (!result.videoUrl && !result.filePath)) {
            return sock.sendMessage(target, {
                text: '❌ *Download failed.* The video might be from a private group/account or removed.',
                contextInfo
            }, { quoted: message });
        }

        const caption = [
            `🎬 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗙𝗔𝗖𝗘𝗕𝗢𝗢𝗞 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 *Title:* ${(result.title || 'Facebook Video').slice(0, 80)}`,
            `✨ *Quality:* ${result.quality || 'HD'}`,
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
            } catch (err) {
                await sock.sendMessage(target, { text: `❌ *Error sending video:* ${err.message}`, contextInfo }, { quoted: message });
            } finally {
                try { if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath); } catch {}
            }
            return;
        }

        try {
            const dl = await axios.get(result.videoUrl, {
                responseType: 'arraybuffer',
                timeout: 45000,
                maxContentLength: 55 * 1024 * 1024,
                headers: { 'User-Agent': UA },
            });
            const ctype = String(dl.headers?.['content-type'] || '').toLowerCase();
            const buf = Buffer.from(dl.data);
            const head = buf.slice(0, 64).toString('utf8').trim().toLowerCase();
            if (buf.length > 4096 && !ctype.includes('text/html') && !head.startsWith('<!doctype') && !head.startsWith('<html')) {
                return await sock.sendMessage(target, {
                    video: buf,
                    mimetype: 'video/mp4',
                    caption,
                    contextInfo
                }, { quoted: message });
            }
            throw new Error('Invalid video buffer');
        } catch {
            try {
                await sock.sendMessage(target, {
                    video:   { url: result.videoUrl },
                    caption: caption,
                    contextInfo
                }, { quoted: message });
            } catch (err) {
                await sock.sendMessage(target, {
                    text: `❌ *Error sending video:* ${err.message}`,
                    contextInfo
                }, { quoted: message });
            }
        }
    }
};
