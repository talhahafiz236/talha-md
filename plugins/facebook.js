'use strict';

const axios = require('axios');
const { getStr } = require('../lib/theme');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Strategy 1: Siputzx Facebook API (verified working fast) ─────────────────
async function trySiputzx(url) {
    const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, {
        headers: { 'User-Agent': UA },
        timeout: 15000
    });
    const d = res.data;
    if (d?.status && d?.data?.downloads?.length) {
        const hd = d.data.downloads.find(x => x.quality === 'HD' || x.quality?.includes('720') || x.quality?.includes('1080'));
        const sd = d.data.downloads.find(x => x.quality === 'SD') || d.data.downloads[0];
        const chosen = (hd || sd)?.url;
        if (chosen) {
            return {
                videoUrl: chosen,
                title: d.data.title || 'Facebook Video',
                quality: hd ? 'HD' : 'SD',
                source: 'Siputzx'
            };
        }
    }
    throw new Error('Siputzx: no download URL');
}

// ─── Strategy 2: rahad-all-downloader-v2 ─────────────────────────────────────
async function tryAllDl(url) {
    const { alldl } = require('rahad-all-downloader-v2');
    const r = await alldl(url);
    const v = r?.data?.videoUrl || r?.data?.download?.video;
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

// ─── Strategy 3: snapsave.app (supports Facebook) ─────────────────────────────
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

// ─── Strategy 4: fdown.net ────────────────────────────────────────────────────
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

module.exports = {
    commands:    ['facebook', 'fb', 'fbdl', 'fbvideo'],
    description: 'Download Facebook videos and reels (HD/SD)',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo }) => {
        const raw = args[0];
        const url = raw?.match(/(https?:\/\/[^\s]+)/)?.[0];

        if (!url || !/(?:facebook\.com|fb\.watch)/.test(url)) {
            return sock.sendMessage(sender, {
                text: '❌ *Invalid Facebook URL!*\n\n💡 *Example:* `.fb https://fb.watch/xyz` or `facebook.com/reel/...`',
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(sender, {
            text: '⏳ *Fetching Facebook Video...* _(High Quality)_',
            contextInfo
        }, { quoted: message });

        const STRATEGIES = [
            { name: 'Siputzx',  fn: () => trySiputzx(url) },
            { name: 'AllDL',    fn: () => tryAllDl(url) },
            { name: 'SnapSave', fn: () => trySnapsave(url) },
            { name: 'FDown',    fn: () => tryFdown(url) }
        ];

        let result = null;
        for (const s of STRATEGIES) {
            try {
                result = await s.fn();
                if (result?.videoUrl) {
                    console.log(`[FB] Success via ${s.name}`);
                    break;
                }
            } catch (e) {
                console.warn(`[FB] ${s.name} failed: ${e.message}`);
            }
        }

        if (!result?.videoUrl) {
            return sock.sendMessage(sender, {
                text: '❌ *Download failed.* The video might be from a private group/account or removed.',
                contextInfo
            }, { quoted: message });
        }

        const caption = [
            `🎬 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗙𝗔𝗖𝗘𝗕𝗢𝗢𝗞 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 *Title:* ${result.title.slice(0, 80)}`,
            `✨ *Quality:* ${result.quality || 'HD'}`,
            `⚡ *Source:* ${result.source}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `👑 *Owner:* Talha Sheikh`,
            `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
        ].join('\n');

        try {
            await sock.sendMessage(sender, {
                video:   { url: result.videoUrl },
                caption: caption,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(sender, {
                text: `❌ *Error sending video:* ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
