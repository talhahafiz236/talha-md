'use strict';

const gemini = require('../lib/gemini');
const { fmt } = require('../lib/theme');

// Uses TALHA-MD's verified AI pipeline: Gemini (if keyed) -> ch.at (GET) -> text.pollinations.ai
async function askAI(prompt) {
    try {
        const answer = await gemini.ask(prompt);
        if (answer && String(answer).trim().length > 2) return String(answer).trim();
    } catch {}
    return '⚠️ AI servers are busy right now. Please try again in a moment.';
}

function buildPlugin(cmds, label, systemHint) {
    return {
        commands:    cmds,
        description: `Ask ${label} a question`,
        usage:       `.${cmds[0]} <question>`,
        permission:  'public',
        group:       true,
        private:     true,

        run: async (sock, message, args, ctx) => {
            const { jid, contextInfo } = ctx;
            const query = args.join(' ').trim();
            if (!query) {
                return sock.sendMessage(jid, {
                    text: fmt(`❌ *Usage:* \`.${cmds[0]} <question>\`\n\nExample: \`.${cmds[0]} What is quantum computing?\``),
                    contextInfo
                }, { quoted: message });
            }
            await sock.sendPresenceUpdate('composing', jid);
            const answer = systemHint
                ? await (async () => {
                    try { return await gemini.ask(query, `${systemHint}. Keep replies concise and WhatsApp-friendly.`); }
                    catch { return askAI(query); }
                })()
                : await askAI(query);
            await sock.sendMessage(jid, {
                text: fmt(`🤖 *${label}*\n\n❓ *Q:* ${query}\n\n💬 *A:* ${answer}`),
                contextInfo
            }, { quoted: message });
        }
    };
}

module.exports = [
    buildPlugin(['chatat', 'chat'],      'ch.at AI',      null),
    buildPlugin(['chatai'],              'TALHA Chat AI', null),
    buildPlugin(['bard'],                'Bard AI',       'Answer as a knowledgeable AI assistant'),
    buildPlugin(['giftedai'],            'Gifted AI',     'Be creative and helpful'),
    buildPlugin(['gpt4', 'gpt-4'],       'GPT-4',         'Provide a detailed expert answer'),
    buildPlugin(['gpt4o', 'gpt-4o'],     'GPT-4o',        'Provide a detailed expert answer'),
    buildPlugin(['gpt4o-mini'],          'GPT-4o Mini',   'Be concise and helpful'),
    buildPlugin(['openai'],              'OpenAI',        'Provide a detailed expert answer'),
    buildPlugin(['venice'],              'Venice AI',     'Be creative and insightful'),
    buildPlugin(['letmegpt'],            'LetMeGPT',      null),
];
