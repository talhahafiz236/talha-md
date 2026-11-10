'use strict';

const gemini = require('../lib/gemini');

async function askAI(query) {
    try {
        const res = await gemini.ask(query);
        if (res && String(res).trim()) return String(res).trim();
    } catch {}
    return '⚠️ AI servers are busy right now. Please try again in a moment.';
}

module.exports = {
    commands:    ['ai', 'gpt', 'chatgpt'],
    description: 'Ask the AI a question (TALHA-MD Neural Core)',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { jid, sender, contextInfo, reply }) => {
        const target = jid || sender;
        const query = args.join(' ').trim();
        if (!query) {
            return reply('❌ Please provide a question!\n\n*Example:* `.ai What is artificial intelligence?`');
        }

        await reply('🤔 _Thinking..._');

        try {
            const response = await askAI(query);
            await sock.sendMessage(target, {
                text: `🤖 *TALHA-MD AI ASSISTANT*\n━━━━━━━━━━━━━━━━━━━━━━━━━\n❓ *Question:* ${query}\n\n💡 *Answer:*\n${response}\n━━━━━━━━━━━━━━━━━━━━━━━━━\n_Powered by TALHA-MD Neural Core_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            await reply('❌ Error communicating with AI: ' + err.message);
        }
    }
};
