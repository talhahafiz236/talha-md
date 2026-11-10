'use strict';
const axios = require('axios');

module.exports = {
    commands: ['quotly', 'quote2img', 'q2s', 'quotesticker'],
    description: 'Convert a quoted text message into a beautiful styled quote image/sticker',
    usage: '.quotly (reply to a message)',
    permission: 'public',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const { reply, safeSend } = ctx;
        const jid = message.key.remoteJid;

        const quoted = message.message?.extendedTextMessage?.contextInfo;
        const quotedText = quoted?.quotedMessage?.conversation
            || quoted?.quotedMessage?.extendedTextMessage?.text
            || args.join(' ').trim();

        if (!quotedText) {
            return reply(
                `📸 *Quotly — Quote to Image*\n\n` +
                `Reply to any text message and use \`.quotly\` to turn it into a beautiful quote image!\n\n` +
                `_Or provide text directly:_ \`.quotly Your quote here\``
            );
        }

        const sender = quoted?.participant || message.key.participant || message.key.remoteJid;
        const senderNum = sender?.split('@')[0] || 'Unknown';

        await safeSend({ text: `🎨 _Creating your quote image..._` }, { quoted: message });

        try {
            const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
                `beautiful minimalist quote card, dark background, elegant white typography: "${quotedText.slice(0, 120)}", clean modern design`
            )}?width=1024&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 999999)}`;

            const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 });
            const ctype = String(imgRes.headers?.['content-type'] || '').toLowerCase();
            const buf = Buffer.from(imgRes.data || []);
            if (!ctype.startsWith('image/') || buf.length < 2048 || /^<(?:!doctype|html)/i.test(buf.slice(0, 64).toString('utf8'))) {
                throw new Error('Invalid image response');
            }
            await sock.sendMessage(jid, {
                image: buf,
                caption: `💬 _"${quotedText}"_\n\n— *+${senderNum}*`,
            }, { quoted: message });

        } catch {
            // Plain text fallback
            await safeSend({
                text:
                    `┌─────────────────────\n` +
                    `│ 💬 *Quote*\n` +
                    `│\n` +
                    `│ _"${quotedText}"_\n` +
                    `│\n` +
                    `│ — *+${senderNum}*\n` +
                    `└─────────────────────`,
            }, { quoted: message });
        }
    },
};
