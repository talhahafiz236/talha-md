'use strict';

const axios = require('axios');
const { fmt } = require('../lib/theme');
const { dlBuffer } = require('../lib/dlmedia');

function isValidPayload(buf, contentType) {
    if (!buf || buf.length < 1024) return false;
    const ctype = String(contentType || '').toLowerCase();
    if (ctype.includes('text/html') || ctype.includes('application/json')) return false;
    const head = buf.slice(0, 128).toString('utf8').trim().toLowerCase();
    if (head.startsWith('<!doctype') || head.startsWith('<html')) return false;
    return true;
}

module.exports = {
    commands: ['toptt', 'tovideo', 'sendaudio', 'sendvideo', 'snack'],
    description: 'Media converters and direct URL audio/video senders',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const cmd = (ctx.command || (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '')).toLowerCase();
        const text = args.join(' ').trim();
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });

        await sock.sendPresenceUpdate('composing', jid);

        if (cmd === 'toptt') {
            const msg = message.message;
            const audMsg = msg?.audioMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage;
            if (!audMsg) return send('❌ Reply to an *audio* or *voice message* with `.toptt`\n\nSends any audio as a voice note (PTT).');
            const buf = await dlBuffer(audMsg, 'audio').catch(() => null);
            if (!buf) return send('❌ Could not download audio.');
            await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/ogg; codecs=opus', ptt: true, contextInfo }, { quoted: message });
            return;
        }

        if (cmd === 'tovideo') {
            const msg = message.message;
            const gifMsg = msg?.videoMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
            if (!gifMsg) return send('❌ Reply to a *video or GIF* with `.tovideo` to convert/send as video.');
            const buf = await dlBuffer(gifMsg, 'video').catch(() => null);
            if (!buf) return send('❌ Could not download video.');
            await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: fmt('🎥 Video'), contextInfo }, { quoted: message });
            return;
        }

        if (cmd === 'sendaudio') {
            if (!text || !/^https?:\/\//i.test(text)) {
                return send('❌ *Usage:* `.sendaudio <audio url>`\n\nSends any audio from a direct HTTP(S) URL as a voice note.');
            }
            try {
                const res = await axios.get(text, { responseType: 'arraybuffer', timeout: 30000 });
                const buf = Buffer.from(res.data);
                if (!isValidPayload(buf, res.headers['content-type'])) {
                    return send('❌ URL did not return a valid audio file.');
                }
                await sock.sendMessage(jid, { audio: buf, mimetype: 'audio/mpeg', ptt: true, contextInfo }, { quoted: message });
            } catch (e) { return send(`❌ Failed to download audio from URL: ${e.message}`); }
            return;
        }

        if (cmd === 'sendvideo') {
            if (!text || !/^https?:\/\//i.test(text)) {
                return send('❌ *Usage:* `.sendvideo <video url>`\n\nSends any video from a direct HTTP(S) URL.');
            }
            try {
                const res = await axios.get(text, { responseType: 'arraybuffer', timeout: 60000 });
                const buf = Buffer.from(res.data);
                if (!isValidPayload(buf, res.headers['content-type'])) {
                    return send('❌ URL did not return a valid video file.');
                }
                await sock.sendMessage(jid, { video: buf, mimetype: 'video/mp4', caption: fmt('🎥 Video'), contextInfo }, { quoted: message });
            } catch (e) { return send(`❌ Failed to download video from URL: ${e.message}`); }
            return;
        }

        if (cmd === 'snack') {
            if (!text) return send('❌ *Usage:* `.snack <snackvideo url>`');
            try {
                const { alldl } = require('rahad-all-downloader-v2');
                const r = await alldl(text);
                const vUrl = r?.data?.videoUrl || r?.data?.download?.video || r?.data?.url;
                if (vUrl) {
                    const res = await axios.get(vUrl, { responseType: 'arraybuffer', timeout: 35000 });
                    const buf = Buffer.from(res.data);
                    if (isValidPayload(buf, res.headers['content-type'])) {
                        return await sock.sendMessage(jid, {
                            video: buf,
                            mimetype: 'video/mp4',
                            caption: fmt(`🎥 *${r?.data?.title || 'Snack Video'}*`),
                            contextInfo
                        }, { quoted: message });
                    }
                }
            } catch {}
            return send('⚠️ Could not extract Snack Video automatically. Verify the link is public.');
        }
    }
};
