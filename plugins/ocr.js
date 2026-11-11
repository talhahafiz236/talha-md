'use strict';
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || config.OCR_SPACE_API_KEY || '';

module.exports = {
    commands:    ['ocr', 'readtext', 'textfromimage'],
    description: 'Extract text from an image (OCR)',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, groupId, sender, contextInfo }) => {
        const chatId = jid || groupId || sender;
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
            || message.message?.imageMessage;
        const imgMsg = quoted?.imageMessage || (message.message?.imageMessage);
        if (!imgMsg) {
            return sock.sendMessage(chatId, {
                text: '🖼️ Please reply to an image to extract its text.\nExample: Reply to image with .ocr',
                contextInfo
            }, { quoted: message });
        }
        if (!OCR_SPACE_API_KEY) {
            return sock.sendMessage(chatId, { text: '❌ OCR API key is not configured. Add OCR_SPACE_API_KEY to the host secrets.', contextInfo }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Extracting text from image...', contextInfo }, { quoted: message });
        try {
            const stream = await downloadContentFromMessage(imgMsg, 'image');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            const b64 = buf.toString('base64');
            const { data } = await axios.post(
                'https://api.ocr.space/parse/image',
                `base64Image=data:image/jpeg;base64,${b64}&language=eng&isOverlayRequired=false`,
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'apikey': OCR_SPACE_API_KEY },
                    timeout: 30000
                }
            );
            const text = data?.ParsedResults?.[0]?.ParsedText?.trim();
            if (!text) throw new Error('No text detected in image.');
            await sock.sendMessage(chatId, {
                text: `📝 *Extracted Text:*\n\n${text}`,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ OCR failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};
