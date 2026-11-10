'use strict';
const axios = require('axios');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function downloadMp4Buffer(videoUrl) {
    const res = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 45 * 1024 * 1024,
        headers: { 'User-Agent': UA, Accept: '*/*' },
        validateStatus: s => s >= 200 && s < 400,
    });
    const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
    const buf = Buffer.from(res.data || []);
    if (ctype.includes('text/html') || buf.length < 4096 || /^<(?:!doctype|html)/i.test(buf.slice(0, 64).toString('utf8'))) {
        throw new Error('CapCut download URL returned HTML');
    }
    return buf;
}

function ytDlpCapCut(url) {
    return new Promise((resolve, reject) => {
        const prefix = path.join(os.tmpdir(), `talha_cc_${Date.now()}`);
        execFile('yt-dlp', ['-f', 'mp4/best', '--no-warnings', '--max-filesize', '45M', '-o', `${prefix}.%(ext)s`, url], { timeout: 45000 }, (err) => {
            const dir = path.dirname(prefix);
            const base = path.basename(prefix);
            const match = fs.readdirSync(dir).find(f => f.startsWith(base));
            if (!match) return reject(err || new Error('yt-dlp failed'));
            const full = path.join(dir, match);
            try {
                const buf = fs.readFileSync(full);
                if (buf.length < 4096) throw new Error('empty video');
                resolve(buf);
            } catch (e) {
                reject(e);
            } finally {
                try { fs.unlinkSync(full); } catch {}
            }
        });
    });
}

module.exports = {
    commands:    ['capcut', 'capcutdl'],
    description: 'Download CapCut videos without watermark',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const chatId = ctx.jid || ctx.sender;
        const { contextInfo } = ctx;
        const url = args[0];
        if (!url || !/capcut\.com/i.test(url)) {
            return sock.sendMessage(chatId, {
                text: '❌ Please provide a valid CapCut URL.\nExample: `.capcut https://www.capcut.com/t/...`',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Fetching CapCut video...', contextInfo }, { quoted: message });

        let buffer = null;

        // Strategy 1: rahad-all-downloader-v2
        try {
            const { alldl } = require('rahad-all-downloader-v2');
            const r = await alldl(url);
            const videoUrl = r?.data?.videoUrl || r?.video || r?.data?.url || r?.url;
            if (videoUrl && /^https?:\/\//i.test(videoUrl)) {
                buffer = await downloadMp4Buffer(videoUrl);
            }
        } catch {}

        // Strategy 2: yt-dlp
        if (!buffer) {
            try { buffer = await ytDlpCapCut(url); } catch {}
        }

        // Strategy 3: ssstik.io
        if (!buffer) {
            try {
                const formData = new URLSearchParams({ id: url, locale: 'en', tt: String(Date.now()) });
                const res = await axios.post('https://ssstik.io/abc?url=dl', formData, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent':   UA,
                        'Referer':      'https://ssstik.io/',
                    },
                    timeout: 20000
                });
                const html = String(res.data || '');
                const match = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i)
                           || html.match(/href="(https?:\/\/[^"]+)"\s*[^>]*>\s*(?:Without|No)/i);
                if (match?.[1]) buffer = await downloadMp4Buffer(match[1]);
            } catch {}
        }

        if (buffer) {
            return sock.sendMessage(chatId, {
                video:   buffer,
                mimetype: 'video/mp4',
                caption: `✂️ *CapCut Download*\n_Powered by TALHA MD_`,
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text:
                `✂️ *CapCut Download*\n\n` +
                `Direct download unavailable right now. Paste the link here:\n` +
                `🔗 https://capcutdownloader.io`,
            contextInfo
        }, { quoted: message });
    }
};
