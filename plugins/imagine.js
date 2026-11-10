'use strict';

const axios = require('axios');

function isValidImageResponse(res) {
    const ctype = String(res?.headers?.['content-type'] || '').toLowerCase();
    const buf = res?.data ? Buffer.from(res.data) : null;
    if (!buf || buf.length < 2048) return false;
    if (ctype && !ctype.startsWith('image/')) return false;
    const head = buf.slice(0, 64).toString('utf8').trim().toLowerCase();
    if (head.startsWith('<!doctype') || head.startsWith('<html')) return false;
    return true;
}

async function generatePollinationsImage(prompt, width = 1024, height = 1024) {
    const models = ['flux', 'turbo', ''];
    let lastErr = null;
    for (const model of models) {
        try {
            const seed = Math.floor(Math.random() * 999999);
            const modelParam = model ? `&model=${model}` : '';
            const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true${modelParam}`;
            const res = await axios.get(imgUrl, {
                responseType: 'arraybuffer',
                timeout: 45000,
                headers: { 'User-Agent': 'TALHAMD-Bot/2.0' },
                validateStatus: s => s >= 200 && s < 400,
            });
            if (isValidImageResponse(res)) {
                return Buffer.from(res.data);
            }
            lastErr = new Error('Invalid image response');
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('Image generator timed out');
}

module.exports = {
    commands:    ['imagine', 'generate', 'aiimage', 'img'],
    description: 'Generate an AI image from a text prompt',
    usage:       '.imagine <description>',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, sender, contextInfo } = ctx;
        const target = jid || sender || message.key.remoteJid;
        if (!args.length) {
            return sock.sendMessage(target, {
                text: `❌ *Usage:* \`.imagine <description>\`\n\n_Examples:_\n• \`.imagine a lion wearing a gold crown\`\n• \`.imagine futuristic city at night, neon lights\``,
                contextInfo
            }, { quoted: message });
        }
        const prompt = args.join(' ').trim();
        await sock.sendMessage(target, {
            text: `🎨 _Generating:_ "*${prompt}*"\n\n⏳ _Please wait..._`,
            contextInfo
        }, { quoted: message });
        try {
            const imgBuf = await generatePollinationsImage(prompt, 1024, 1024);
            await sock.sendMessage(target, {
                image:   imgBuf,
                mimetype: 'image/jpeg',
                caption: `🎨 *AI Generated Image*\n\n📝 *Prompt:* ${prompt}\n_⚡ Powered by TALHA-MD_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(target, { text: `❌ Image generation failed: ${err.message}`, contextInfo }, { quoted: message });
        }
    }
};
