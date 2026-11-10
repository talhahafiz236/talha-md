'use strict';

const gemini = require('../lib/gemini');

module.exports = {
    commands:    ['describe', 'caption', 'what', 'imgcaption', 'seethis', 'analyze'],
    description: 'AI describes/analyzes an image — reply to any photo and ask what it is',
    usage: '.describe (reply to an image)',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { reply, safeSend, download } = ctx;

        const msg = message.message;
        const imgMsg = msg?.imageMessage
            || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
            || null;

        if (!imgMsg) {
            return reply(
                `👁️ *Image Describer*\n\n` +
                `Reply to any image and use \`.describe\` and I'll tell you what's in it!\n\n` +
                `_Examples:_\n` +
                `• Reply to a photo → \`.describe\`\n` +
                `• Reply to a photo → \`.what is in this image\`\n` +
                `• Reply to a photo → \`.analyze\``
            );
        }

        const question = args.join(' ').trim() || 'Describe this image in detail. What do you see?';

        await safeSend({ text: `👁️ _Analyzing the image..._` }, { quoted: message });

        try {
            const imgBuffer = await download(imgMsg, 'image');
            if (!imgBuffer) throw new Error('Could not download image');

            const mimeType = imgMsg.mimetype || 'image/jpeg';
            const visionText = await gemini.analyzeImage(imgBuffer, question, mimeType);
            if (visionText) {
                return await safeSend({
                    text: `👁️ *Image Analysis*\n\n${visionText}`,
                }, { quoted: message });
            }

            // Fallback metadata inspection via sharp (if no GEMINI_API_KEY configured)
            let w = imgMsg.width || '?';
            let h = imgMsg.height || '?';
            let fmt = mimeType;
            try {
                const sharp = require('sharp');
                const meta = await sharp(imgBuffer).metadata();
                if (meta?.width) w = meta.width;
                if (meta?.height) h = meta.height;
                if (meta?.format) fmt = meta.format.toUpperCase();
            } catch {}

            const sizeKb = Math.max(1, Math.round((imgBuffer.length || Number(imgMsg.fileLength) || 0) / 1024));
            await safeSend({
                text:
                    `👁️ *Image Info*\n\n` +
                    `📐 *Resolution:* ${w} × ${h}px\n` +
                    `📦 *Size:* ${sizeKb} KB\n` +
                    `🖼️ *Format:* ${fmt}\n\n` +
                    `_For full AI vision descriptions, add \`GEMINI_API_KEY\` to environment variables._`,
            }, { quoted: message });

        } catch (e) {
            reply(`❌ Could not analyze the image: ${e.message}`);
        }
    },
};
