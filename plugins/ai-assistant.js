'use strict';

const axios = require('axios');

async function askAI(query) {
    // 1. Try pollinations OpenAI model (Fast & free, no API key needed)
    try {
        const res = await axios.get(
            `https://text.pollinations.ai/${encodeURIComponent(query.slice(0, 500))}?model=openai&seed=${Date.now() % 9999}`,
            { timeout: 12000 }
        );
        if (typeof res.data === 'string' && res.data.trim()) {
            return res.data.trim();
        }
    } catch {}

    // 2. Try ch.at API
    try {
        const res = await axios.post(
            'https://ch.at/api/chat',
            { message: query },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const t = res.data?.answer || res.data?.reply || res.data?.message || res.data?.response;
        if (t && String(t).trim()) return String(t).trim();
    } catch {}

    return '⚠️ AI servers are busy right now. Please try again in a moment.';
}

module.exports = {
    commands:    ['ai', 'gpt', 'chatgpt', 'ask'],
    description: 'Ask the AI a question (GPT-4o powered)',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo, reply }) => {
        const query = args.join(' ').trim();
        if (!query) {
            return reply('❌ Please provide a question!\n\n*Example:* `.ai What is artificial intelligence?`');
        }

        await reply('🤔 _Thinking..._');

        try {
            const response = await askAI(query);
            await sock.sendMessage(sender, {
                text: `🤖 *TALHA-MD AI ASSISTANT*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n❓ *Question:* ${query}\n\n💡 *Answer:*\n${response}\n━━━━━━━━━━━━━━━━━━━━━━━━━\n_Powered by TALHA-MD Neural Core_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            await reply('❌ Error communicating with AI: ' + err.message);
        }
    }
};
