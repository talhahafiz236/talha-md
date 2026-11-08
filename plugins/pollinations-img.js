'use strict';

const axios = require('axios');

module.exports = {
    commands:    ['img', 'draw', 'pollination', 'art'],
    description: 'Generate high quality AI images with Pollinations AI',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { sender, reply, contextInfo } = ctx;
        const prompt = args.join(' ').trim();

        if (!prompt) {
            return reply(
                `┌───「 🎨 *TALHA-MD AI ART ENGINE* 」───\n` +
                `│ 💡 *Usage:* .img <prompt>\n` +
                `│ 📌 *Example:* .img cyber sports car with neon lights in rain\n` +
                `└───────────────────────────────────\n` +
                `_⚡ Powered by TALHA-MD Neural Core_`
            );
        }

        await reply(`🎨 *Rendering Pixels:* Generating Ultra-HD artwork for "${prompt.substring(0, 40)}..." (approx 3-5 sec) ✨`);

        try {
            const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=800&nologo=true`;
            const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 35000 });

            const caption = 
                `┌───「 🎨 *TALHA-MD ARTWORK GENERATED* 」───\n` +
                `│ 🖌️ *Prompt:* ${prompt}\n` +
                `│ ✨ *Quality:* Ultra HD Render\n` +
                `│ 👑 *Owner:* Talha Sheikh\n` +
                `└────────────────────────────────────────\n` +
                `_⚡ TALHA-MD • Creative AI Engine_`;

            await sock.sendMessage(sender, {
                image: Buffer.from(res.data),
                caption: caption,
                mimetype: 'image/jpeg',
                contextInfo: contextInfo || {}
            }, { quoted: message });
        } catch (err) {
            await reply(`❌ *Image Generation Error:* ${err.message || 'Could not fetch image. Please try again later.'}`);
        }
    }
};
