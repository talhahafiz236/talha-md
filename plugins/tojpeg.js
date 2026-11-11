'use strict';
const sharp = require('sharp');
const { dlBuffer } = require('../lib/dlmedia');
const { withMediaSlot, configureSharpLowMem, getMaxMediaBytes } = require('../lib/memory-guard');

module.exports = {
    commands:    ['tojpeg', 'toimg', 'stickertoimg', 'unwebp'],
    description: 'Convert sticker to JPEG image',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const chatId = jid || sender;
        const ctx        = message.message?.extendedTextMessage?.contextInfo;
        const quoted     = ctx?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage || message.message?.stickerMessage;
        if (!stickerMsg) {
            return sock.sendMessage(chatId, {
                text: '🖼️ Reply to a sticker with .tojpeg to convert it.',
                contextInfo
            }, { quoted: message });
        }
        try {
            const jpegBuffer = await withMediaSlot(async () => {
                configureSharpLowMem(sharp);
                const stickerBuffer = await dlBuffer(stickerMsg, 'sticker', { maxBytes: getMaxMediaBytes() });
                return sharp(stickerBuffer, { animated: false })
                    .rotate()
                    .jpeg({ quality: 90 })
                    .toBuffer();
            });
            await sock.sendMessage(chatId, {
                image:    jpegBuffer,
                mimetype: 'image/jpeg',
                caption:  '🖼️ *Sticker converted to image*\n_Powered by TALHA MD_',
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ Conversion failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};
