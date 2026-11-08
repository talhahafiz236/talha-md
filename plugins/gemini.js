'use strict';

const gemini = require('../lib/gemini');

module.exports = {
    commands:    ['gemini', 'askgemini', 'geminiai'],
    description: 'Ask Google Gemini AI with high-speed response',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, ctx) => {
        const { sender, reply, contextInfo } = ctx;
        const query = args.join(' ').trim();

        if (!query) {
            return reply(
                `┌───「 🧠 *TALHA-MD GEMINI AI* 」───\n` +
                `│ 💡 *Usage:* .gemini <your question>\n` +
                `│ 📌 *Example:* .gemini write a short poem on success\n` +
                `└───────────────────────────────────\n` +
                `_⚡ Powered by TALHA-MD Neural Core_`
            );
        }

        await reply(`⚡ *TALHA-MD Neural Thinking:* Processing your answer with Gemini...`);

        const answer = await gemini.ask(query);

        const responseText = 
            `┌───「 🧠 *TALHA-MD GEMINI INTELLIGENCE* 」───\n` +
            `│ ❓ *Query:* ${query.length > 50 ? query.substring(0, 47) + '...' : query}\n` +
            `└────────────────────────────────────────\n\n` +
            `${answer}\n\n` +
            `────────────────────────────────────────\n` +
            `_⚡ TALHA-MD • Engineered for Talha Sheikh_`;

        await sock.sendMessage(sender, {
            text: responseText,
            contextInfo: contextInfo || {}
        }, { quoted: message });
    }
};
