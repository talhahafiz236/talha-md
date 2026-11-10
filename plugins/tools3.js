'use strict';

const axios  = require('axios');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const dns    = require('dns').promises;
const { execFile } = require('child_process');
const FormData = require('form-data');
const { fmt } = require('../lib/theme');

const FANCY_MAP = {
    bold:        s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D3BF);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D3B9);
        if (code >= 48 && code <= 57) return String.fromCodePoint(code + 0x1D7CE);
        return c;
    }).join(''),
    italic:      s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(code + 0x1D3F3);
        if (code >= 97 && code <= 122) return String.fromCodePoint(code + 0x1D3ED);
        return c;
    }).join(''),
    script:      s => s.split('').map(c => {
        const map = { a:'𝒶',b:'𝒷',c:'𝒸',d:'𝒹',e:'𝑒',f:'𝒻',g:'𝑔',h:'𝒽',i:'𝒾',j:'𝒿',k:'𝓀',l:'𝓁',m:'𝓂',n:'𝓃',o:'𝑜',p:'𝓅',q:'𝓆',r:'𝓇',s:'𝓈',t:'𝓉',u:'𝓊',v:'𝓋',w:'𝓌',x:'𝓍',y:'𝓎',z:'𝓏' };
        return map[c.toLowerCase()] || c;
    }).join(''),
    bubble:      s => s.split('').map(c => {
        const map = { a:'ⓐ',b:'ⓑ',c:'ⓒ',d:'ⓓ',e:'ⓔ',f:'ⓕ',g:'ⓖ',h:'ⓗ',i:'ⓘ',j:'ⓙ',k:'ⓚ',l:'ⓛ',m:'ⓜ',n:'ⓝ',o:'ⓞ',p:'ⓟ',q:'ⓠ',r:'ⓡ',s:'ⓢ',t:'ⓣ',u:'ⓤ',v:'ⓥ',w:'ⓦ',x:'ⓧ',y:'ⓨ',z:'ⓩ',A:'Ⓐ',B:'Ⓑ',C:'Ⓒ',D:'Ⓓ',E:'Ⓔ',F:'Ⓕ',G:'Ⓖ',H:'Ⓗ',I:'Ⓘ',J:'Ⓙ',K:'Ⓚ',L:'Ⓛ',M:'Ⓜ',N:'Ⓝ',O:'Ⓞ',P:'Ⓟ',Q:'Ⓠ',R:'Ⓡ',S:'Ⓢ',T:'Ⓣ',U:'Ⓤ',V:'Ⓥ',W:'Ⓦ',X:'Ⓧ',Y:'Ⓨ',Z:'Ⓩ' };
        return map[c] || c;
    }).join(''),
    square:      s => s.split('').map(c => {
        const map = { a:'🄰',b:'🄱',c:'🄲',d:'🄳',e:'🄴',f:'🄵',g:'🄶',h:'🄷',i:'🄸',j:'🄹',k:'🄺',l:'🄻',m:'🄼',n:'🄽',o:'🄾',p:'🄿',q:'🅀',r:'🅁',s:'🅂',t:'🅃',u:'🅄',v:'🅅',w:'🅆',x:'🅇',y:'🅈',z:'🅉' };
        return map[c.toLowerCase()] || c;
    }).join(''),
    vaporwave:   s => s.split('').map(c => {
        const code = c.charCodeAt(0);
        if (code >= 33 && code <= 126) return String.fromCodePoint(code + 0xFEE0);
        return c;
    }).join(''),
};

function enhancePhotoLocally(imgBuffer) {
    return new Promise((resolve, reject) => {
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const inPath  = path.join(os.tmpdir(), `talha_enh_in_${uid}.jpg`);
        const outPath = path.join(os.tmpdir(), `talha_enh_out_${uid}.jpg`);
        try {
            fs.writeFileSync(inPath, imgBuffer);
        } catch (e) {
            return reject(e);
        }
        execFile(
            'ffmpeg',
            [
                '-y', '-i', inPath,
                '-vf', 'scale=iw*2:ih*2:flags=lanczos,hqdn3d=1.5:1.5:6:6,unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.05:saturation=1.08',
                '-q:v', '2',
                outPath,
            ],
            { timeout: 30000 },
            (err) => {
                try {
                    if (err || !fs.existsSync(outPath)) return reject(err || new Error('ffmpeg enhance failed'));
                    const buf = fs.readFileSync(outPath);
                    if (buf.length < 1024) return reject(new Error('Enhanced image empty'));
                    resolve(buf);
                } finally {
                    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
                    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
                }
            }
        );
    });
}

module.exports = {
    commands: [
        'ebinary', 'debinary', 'dbinary', 'ebase', 'dbase',
        'fancy', 'ttp', 'domaincheck', 'rename', 'rebrandly', 'vgd', 'vurl',
        'adfoc', 'cleanuri', 'createpdf', 'createqr', 'readqr',
        'shortener', 'sspc', 'ssphone', 'sstab', 'ssur', 'ssweb',
        'web2zip', 'photoeditor', 'remini', 'met', 'onwa'
    ],
    description: 'Extended tools and utilities',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const cmd  = (ctx.command || (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '')).toLowerCase();
        const text = args.join(' ').trim();
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });

        if (cmd === 'ebinary') {
            if (!text) return send('❌ *Usage:* `.ebinary <text>`');
            const bin = text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
            return send(`🔢 *Text → Binary*\n\n*Input:* ${text}\n*Output:* ${bin}`);
        }

        if (cmd === 'debinary' || cmd === 'dbinary') {
            if (!text) return send('❌ *Usage:* `.debinary <binary>`');
            try {
                const decoded = text.trim().split(/\s+/).map(b => String.fromCharCode(parseInt(b, 2))).join('');
                return send(`🔢 *Binary → Text*\n\n*Input:* ${text}\n*Output:* ${decoded}`);
            } catch { return send('❌ Invalid binary input.'); }
        }

        if (cmd === 'ebase') {
            if (!text) return send('❌ *Usage:* `.ebase <text>`');
            return send(`🔐 *Base64 Encode*\n\n*Input:* ${text}\n*Output:* ${Buffer.from(text).toString('base64')}`);
        }

        if (cmd === 'dbase') {
            if (!text) return send('❌ *Usage:* `.dbase <base64>`');
            try {
                return send(`🔐 *Base64 Decode*\n\n*Input:* ${text}\n*Output:* ${Buffer.from(text, 'base64').toString('utf8')}`);
            } catch { return send('❌ Invalid base64 input.'); }
        }

        if (cmd === 'fancy') {
            if (!text) return send('❌ *Usage:* `.fancy <text>`\n\nStyles: bold, italic, script, bubble, square, vaporwave');
            const parts = text.split('|');
            const style = parts.length > 1 ? parts[0].trim().toLowerCase() : 'all';
            const input = parts.length > 1 ? parts.slice(1).join('|').trim() : text;

            if (style === 'all') {
                const results = Object.entries(FANCY_MAP).map(([name, fn]) => `*${name}:* ${fn(input)}`).join('\n');
                return send(`✨ *Fancy Text: "${input}"*\n\n${results}`);
            }
            const fn = FANCY_MAP[style];
            if (!fn) return send(`❌ Unknown style. Choose from: ${Object.keys(FANCY_MAP).join(', ')}`);
            return send(`✨ *${style}:* ${fn(input)}`);
        }

        if (cmd === 'ttp') {
            if (!text) return send('❌ *Usage:* `.ttp <text>`');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`clean bold neon 3d typography poster reading "${text.slice(0, 80)}", dark background`)}?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`;
                const res = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 25000 });
                const buf = Buffer.from(res.data || []);
                if (buf.length > 2048) {
                    return await sock.sendMessage(jid, { image: buf, caption: fmt(`🖼️ *${text}*`), contextInfo }, { quoted: message });
                }
            } catch {}
            return send(`🖼️ *Text Style:*\n\n${FANCY_MAP.bold(text)}`);
        }

        if (cmd === 'domaincheck') {
            const domain = text.replace(/^https?:\/\//i, '').split('/')[0].trim().toLowerCase();
            if (!domain || !domain.includes('.')) {
                return send('❌ *Usage:* `.domaincheck <domain>`\n\nExample: `.domaincheck example.com`');
            }
            try {
                const [dnsRes, rdapRes] = await Promise.allSettled([
                    dns.resolve4(domain),
                    axios.get(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { timeout: 8000 }),
                ]);
                const ips = dnsRes.status === 'fulfilled' ? dnsRes.value : [];
                const rdap = rdapRes.status === 'fulfilled' ? rdapRes.value.data : null;
                const registered = Boolean(ips.length || rdap?.ldhName);
                const status = rdap?.status?.slice(0, 3).join(', ') || (registered ? 'Active DNS records' : 'No DNS/RDAP record found');
                return send(
                    `🌐 *Domain Check: ${domain}*\n\n` +
                    `📌 *Status:* ${registered ? '❌ Registered' : '✅ Possibly Available'}\n` +
                    `📡 *A Records:* ${ips.length ? ips.slice(0, 3).join(', ') : 'None'}\n` +
                    `📋 *Registry:* ${status}`
                );
            } catch {
                return send(`🌐 *Domain Check: ${domain}*\n\nStatus: Lookup unavailable right now.`);
            }
        }

        if (cmd === 'vgd') {
            if (!text) return send('❌ *Usage:* `.vgd <url>`');
            try {
                const res = await axios.get(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(text)}`, { timeout: 10000 });
                return send(`🔗 *v.gd Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
            } catch { return send('❌ v.gd failed.'); }
        }

        if (['cleanuri', 'rebrandly', 'vurl', 'adfoc', 'shortener'].includes(cmd)) {
            if (!text) return send(`❌ *Usage:* \`.${cmd} <url>\``);
            try {
                const res = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(text)}`, { timeout: 10000 });
                return send(`🔗 *Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
            } catch {
                try {
                    const res = await axios.get(`https://clck.ru/--?url=${encodeURIComponent(text)}`, { timeout: 10000 });
                    return send(`🔗 *Short URL*\n\n*Original:* ${text}\n*Short:* ${res.data}`);
                } catch { return send('❌ URL shortener failed.'); }
            }
        }

        if (cmd === 'createqr') {
            if (!text) return send('❌ *Usage:* `.createqr <text or URL>`');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const qrcode = require('qrcode');
                const buf = await qrcode.toBuffer(text, { width: 320 });
                await sock.sendMessage(jid, { image: buf, caption: fmt(`📱 QR Code for: ${text}`), contextInfo }, { quoted: message });
            } catch { return send('❌ Failed to generate QR code.'); }
            return;
        }

        if (cmd === 'readqr') {
            const msg    = message.message;
            const imgMsg = msg?.imageMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (!imgMsg) return send('❌ Send or reply to an image with `.readqr`');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const { dlBuffer } = require('../lib/dlmedia');
                const buf = await dlBuffer(imgMsg, 'image');
                const form = new FormData();
                form.append('file', buf, { filename: 'qr.jpg', contentType: 'image/jpeg' });
                const res = await axios.post('https://api.qrserver.com/v1/read-qr-code/', form, {
                    headers: form.getHeaders(),
                    timeout: 15000,
                });
                const qr = res.data?.[0]?.symbol?.[0]?.data;
                return send(qr ? `📱 *QR Code Content:*\n\n${qr}` : '❌ Could not read QR code from image.');
            } catch { return send('❌ Failed to read QR code.'); }
        }

        if (['sspc', 'ssphone', 'sstab', 'ssur', 'ssweb'].includes(cmd)) {
            const url = text.startsWith('http') ? text : `https://${text}`;
            if (!text || url === 'https://') return send(`❌ *Usage:* \`.${cmd} <url>\`\n\nExample: \`.ssweb google.com\``);
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const device = cmd === 'ssphone' ? '375x812' : cmd === 'sstab' ? '768x1024' : '1280x900';
                const apiUrl = `https://image.thum.io/get/width/${device.split('x')[0]}/crop/${device.split('x')[1]}/${url}`;
                const res    = await axios.get(apiUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const buf    = Buffer.from(res.data || []);
                if (buf.length < 1024) throw new Error('empty');
                await sock.sendMessage(jid, { image: buf, caption: fmt(`📸 Screenshot: ${url}`), contextInfo }, { quoted: message });
            } catch { return send(`❌ Failed to screenshot ${url}`); }
            return;
        }

        if (cmd === 'createpdf') {
            return send('📄 *Create PDF*\n\nSend text and use `.fetch <url>` to inspect web content, or share PDF documents directly in chat.');
        }

        if (cmd === 'web2zip' || cmd === 'rename') {
            return send(`🔧 *${cmd}*\n\n_Reply to a file in chat or use your file manager for bulk archive operations._`);
        }

        if (cmd === 'photoeditor') {
            return send('🖼️ *Photo Editor*\n\nUse these built-in commands:\n• `.sticker` — convert to sticker\n• `.toimg` — convert sticker to image\n• `.tojpeg` — convert to JPEG\n• `.remini` — HD upscale & sharpen\n• `.togif` — convert to GIF\n• `.color` — color palette lookup');
        }

        if (cmd === 'remini') {
            const msg    = message.message;
            const imgMsg = msg?.imageMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (!imgMsg) return send('❌ Send or reply to an image with `.remini` to upscale & enhance it.');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const { dlBuffer } = require('../lib/dlmedia');
                const buf  = await dlBuffer(imgMsg, 'image');
                const enhancedBuf = await enhancePhotoLocally(buf);
                await sock.sendMessage(jid, {
                    image: enhancedBuf,
                    mimetype: 'image/jpeg',
                    caption: fmt('✨ *HD Enhanced Photo* _(2x Lanczos + Denoise + Sharpen)_'),
                    contextInfo,
                }, { quoted: message });
            } catch (e) { return send(`❌ Photo enhancement failed: ${e.message}`); }
            return;
        }

        if (cmd === 'met') {
            const uptime   = process.uptime();
            const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
            const mem  = process.memoryUsage();
            const toMB = b => (b / 1024 / 1024).toFixed(1);
            return send(
                `📊 *Bot Metrics*\n\n` +
                `⏱ *Uptime:* ${h}h ${m}m ${s}s\n` +
                `🧠 *Heap Used:* ${toMB(mem.heapUsed)} MB\n` +
                `🧠 *Heap Total:* ${toMB(mem.heapTotal)} MB\n` +
                `📦 *RSS:* ${toMB(mem.rss)} MB\n` +
                `🕐 *Time:* ${new Date().toLocaleString()}`
            );
        }

        if (cmd === 'onwa') {
            const num = args[0]?.replace(/\D/g, '');
            if (!num) return send('❌ *Usage:* `.onwa <number>`\n\nExample: `.onwa 923001234567`');
            return send(`🔗 *Open in WhatsApp*\n\nhttps://wa.me/${num}\n\nClick the link to open a chat with +${num}`);
        }
    }
};
