'use strict';

const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
let cachedClientId = '';

async function getSoundCloudClientId(html) {
    if (cachedClientId) return cachedClientId;
    const scripts = [...String(html || '').matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)]
        .map(m => m[1])
        .reverse()
        .slice(0, 6);
    for (const scriptUrl of scripts) {
        try {
            const res = await axios.get(scriptUrl, { headers: { 'User-Agent': UA }, timeout: 10000 });
            const match = String(res.data || '').match(/client_id\s*:\s*["']([A-Za-z0-9]{20,40})["']/);
            if (match?.[1]) {
                cachedClientId = match[1];
                return cachedClientId;
            }
        } catch {}
    }
    return null;
}

async function resolveSoundCloudHydration(url) {
    const page = await axios.get(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        timeout: 15000,
    });
    const html = String(page.data || '');
    const hydMatch = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (!hydMatch) throw new Error('SoundCloud hydration not found');

    const hydration = JSON.parse(hydMatch[1]);
    const soundObj = hydration.find(h => h?.hydratable === 'sound')?.data;
    if (!soundObj?.media?.transcodings?.length) throw new Error('No playable streams found');

    const clientId = await getSoundCloudClientId(html);
    if (!clientId) throw new Error('Could not obtain SoundCloud client_id');

    const prog = soundObj.media.transcodings.find(t => t?.format?.protocol === 'progressive' && /mpeg/i.test(t?.format?.mime_type || ''))
        || soundObj.media.transcodings.find(t => t?.format?.protocol === 'progressive');
    if (prog?.url) {
        const sep = prog.url.includes('?') ? '&' : '?';
        const sRes = await axios.get(`${prog.url}${sep}client_id=${clientId}`, {
            headers: { 'User-Agent': UA },
            timeout: 12000,
        });
        if (sRes.data?.url) {
            return {
                audioUrl: sRes.data.url,
                title: soundObj.title || 'SoundCloud Track',
                author: soundObj.user?.username || 'Unknown',
            };
        }
    }
    throw new Error('No progressive MP3 stream available');
}

function tryYtDlpSoundCloud(url) {
    return new Promise((resolve, reject) => {
        const prefix = path.join(os.tmpdir(), `sc_ytdlp_${Date.now()}`);
        const mp3Path = `${prefix}.mp3`;
        execFile('yt-dlp', [
            '-x', '--audio-format', 'mp3',
            '--no-playlist', '--no-warnings',
            '--max-filesize', '35M',
            '-o', `${prefix}.%(ext)s`,
            url,
        ], { timeout: 50000 }, (err) => {
            if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 2048) {
                return resolve({ filePath: mp3Path, title: 'SoundCloud Track', author: 'SoundCloud' });
            }
            const dir = path.dirname(prefix);
            const base = path.basename(prefix);
            const found = fs.readdirSync(dir).find(f => f.startsWith(base));
            if (found) {
                return resolve({ filePath: path.join(dir, found), title: 'SoundCloud Track', author: 'SoundCloud' });
            }
            reject(err || new Error('yt-dlp SoundCloud failed'));
        });
    });
}

async function resolveSoundCloud(url) {
    try {
        return await resolveSoundCloudHydration(url);
    } catch {}
    try {
        return await tryYtDlpSoundCloud(url);
    } catch {}
    return null;
}

module.exports = {
    commands:    ['soundcloud', 'scdl'],
    description: 'Download SoundCloud tracks as MP3',
    usage:       '.soundcloud <track url>',
    permission:  'public',
    group:       true,
    private:     true,
    resolveSoundCloud,

    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const url = args[0]?.match(/(https?:\/\/[^\s]+)/)?.[0] || args[0];
        if (!url || !/soundcloud\.com|on\.soundcloud\.com/i.test(url)) {
            return sock.sendMessage(target, {
                text: '🎵 Please provide a valid SoundCloud URL.\nExample: `.soundcloud https://soundcloud.com/artist/track`',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(target, { text: '⏳ Downloading SoundCloud audio...', contextInfo }, { quoted: message });

        const resolved = await resolveSoundCloud(url);
        if (!resolved || (!resolved.audioUrl && !resolved.filePath)) {
            return sock.sendMessage(target, {
                text: `❌ *SoundCloud Download Failed*\n\nTrack may be Go+ paid/DRM-protected or removed.`,
                contextInfo
            }, { quoted: message });
        }

        try {
            let audioPayload;
            if (resolved.filePath) {
                audioPayload = fs.readFileSync(resolved.filePath);
            } else {
                const res = await axios.get(resolved.audioUrl, { responseType: 'arraybuffer', timeout: 45000 });
                audioPayload = Buffer.from(res.data);
            }

            await sock.sendMessage(target, {
                audio: audioPayload,
                mimetype: 'audio/mpeg',
                ptt: false,
                contextInfo
            }, { quoted: message });
            await sock.sendMessage(target, {
                text: `🎵 *${resolved.title}*\n👤 ${resolved.author}\n_Powered by TALHA-MD_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(target, {
                text: `❌ *SoundCloud Send Failed:* ${err.message}`,
                contextInfo
            }, { quoted: message });
        } finally {
            if (resolved.filePath) {
                try { if (fs.existsSync(resolved.filePath)) fs.unlinkSync(resolved.filePath); } catch {}
            }
        }
    }
};
