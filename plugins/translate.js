'use strict';
const axios = require('axios');
const { translate } = require('@vitalets/google-translate-api');

module.exports = {
    commands:    ['translate', 'tr'],
    description: 'Translate text to another language (supports quoted messages)',
    usage:       '.translate <lang> <text>  e.g. .translate ur Hello world',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = ctx.jid || message.key.remoteJid;

        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = (
            quoted?.conversation ||
            quoted?.extendedTextMessage?.text ||
            quoted?.imageMessage?.caption ||
            quoted?.videoMessage?.caption ||
            ''
        ).trim();

        const targetLang = (args[0] || '').toLowerCase();
        const text = (args.slice(1).join(' ').trim() || quotedText).trim();

        if (!targetLang || !text) {
            return sock.sendMessage(jid, {
                text:
                    `❌ *Usage:* \`.translate <lang> <text>\`\n_(Or reply to any message with \`.tr <lang>\`)_\n\n` +
                    `*Examples:*\n• \`.tr ur Hello, how are you?\`\n• \`.tr en Assalam o Alaikum\`\n• \`.tr fr Good morning\`\n\n` +
                    `🌍 *Codes:* ur, en, ar, fr, es, de, hi, zh, ja, tr`,
                contextInfo
            }, { quoted: message });
        }

        // Primary: Google Translate (supports auto-detect + any language)
        try {
            const res = await translate(text, { to: targetLang });
            const fromLang = res?.raw?.src ? String(res.raw.src).toUpperCase() : 'AUTO';
            if (res?.text) {
                return sock.sendMessage(jid, {
                    text:
                        `🌍 *Translation*\n\n` +
                        `📝 *Original (${fromLang}):*\n${text}\n\n` +
                        `✅ *Translated (${targetLang.toUpperCase()}):*\n${res.text}`,
                    contextInfo
                }, { quoted: message });
            }
        } catch {}

        // Fallback: MyMemory
        try {
            const res = await axios.get('https://api.mymemory.translated.net/get', {
                params: { q: text, langpair: `en|${targetLang}` },
                timeout: 10000
            });
            const translated = res.data?.responseData?.translatedText;
            if (!translated || res.data.responseStatus !== 200) throw new Error('Translation failed');
            return sock.sendMessage(jid, {
                text:
                    `🌍 *Translation*\n\n` +
                    `📝 *Original:*\n${text}\n\n` +
                    `✅ *Translated (${targetLang.toUpperCase()}):*\n${translated}`,
                contextInfo
            }, { quoted: message });
        } catch {
            await sock.sendMessage(jid, {
                text: `❌ Translation failed. Check the language code and try again.\n_Codes: ur, en, ar, fr, es, de, hi, zh, ja, tr_`,
                contextInfo
            }, { quoted: message });
        }
    }
};
