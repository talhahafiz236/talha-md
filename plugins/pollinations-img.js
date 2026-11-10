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

module.exports = {
    commands:    ['draw', 'pollination', 'aiart'],
    description: 'Generate high quality AI artwork with Pollinations AI',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { jid, sender, reply, contextInfo } = ctx;
        const target = jid || sender;
        const prompt = args.join(' ').trim();

        if (!prompt) {
            return reply(
                `┌───「 🎨 *TALHA-MD AI ART ENGINE* 」───\n` +
                `│ 💡 *Usage:* .draw <prompt>\n` +
                `│ 📌 *Example:* .draw cyber sports car with neon lights in rain\n` +
                `└───────────────────────────────────\n` +
                `_⚡ Powered by TALHA-MD Neural Core_`
            );
        }

        await reply(`🎨 *Rendering Pixels:* Generating Ultra-HD artwork for "${prompt.substring(0, 40)}..." ✨`);

        let imgBuf = null;
        let lastErr = null;
        for (const model of ['flux', 'turbo', '']) {
            try {
                const seed = Math.floor(Math.random() * 999999);
                const modelParam = model ? `&model=${model}` : '';
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=800&seed=${seed}&nologo=true${modelParam}`;
                const res = await axios.get(imageUrl, {
                    responseType: 'arraybuffer',
                    timeout: 45000,
                    headers: { 'User-Agent': 'TALHAMD-Bot/2.0' },
                    validateStatus: s => s >= 200 && s < 400,
                });
                if (isValidImageResponse(res)) {
                    imgBuf = Buffer.from(res.data);
                    break;
                }
                lastErr = new Error('Invalid image buffer returned');
            } catch (err) {
                lastErr = err;
            }
        }

        if (!imgBuf) {
            return reply(`❌ *Image Generation Error:* ${lastErr?.message || 'Could not fetch image. Please try again later.'}`);
        }

        const caption =
            `┌───「 🎨 *TALHA-MD ARTWORK GENERATED* 」───\n` +
            `│ 🖌️ *Prompt:* ${prompt}\n` +
            `│ ✨ *Quality:* Ultra HD Render\n` +
            `│ 👑 *Owner:* Talha Sheikh\n` +
            `└────────────────────────────────────────\n` +
            `_⚡ TALHA-MD • Creative AI Engine_`;

        await sock.sendMessage(target, {
            image: imgBuf,
            caption,
            mimetype: 'image/jpeg',
            contextInfo: contextInfo || {}
        }, { quoted: message });
    }
};
