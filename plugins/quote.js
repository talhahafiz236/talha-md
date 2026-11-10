'use strict';
const axios = require('axios');
const { fmt } = require('../lib/theme');

const FALLBACK_QUOTES = [
    { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
    { q: "In the middle of every difficulty lies opportunity.", a: "Albert Einstein" },
    { q: "It does not matter how slowly you go as long as you do not stop.", a: "Confucius" },
    { q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
    { q: "Believe you can and you're halfway there.", a: "Theodore Roosevelt" },
];

module.exports = {
    commands:    ['quote', 'inspire', 'motivation'],
    description: 'Get a random inspirational quote',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = ctx.jid || message.key.remoteJid;
        let content, author;

        // 1. DummyJSON quotes
        try {
            const res = await axios.get('https://dummyjson.com/quotes/random', { timeout: 6000 });
            if (res.data?.quote) {
                content = res.data.quote;
                author  = res.data.author || 'Unknown';
            }
        } catch {}

        // 2. ZenQuotes
        if (!content) {
            try {
                const res = await axios.get('https://zenquotes.io/api/random', { timeout: 6000 });
                const q = Array.isArray(res.data) ? res.data[0] : res.data;
                if (q?.q) {
                    content = q.q;
                    author  = q.a || 'Unknown';
                }
            } catch {}
        }

        // 3. Stoic Quotes
        if (!content) {
            try {
                const res = await axios.get('https://stoic-quotes.com/api/quote', { timeout: 6000 });
                if (res.data?.text) {
                    content = res.data.text;
                    author  = res.data.author || 'Stoic';
                }
            } catch {}
        }

        if (!content) {
            const pick = FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
            content = pick.q;
            author  = pick.a;
        }

        await sock.sendMessage(jid, {
            text: fmt(`💬 *Quote of the Moment*\n\n"${content}"\n\n— *${author}*`),
            contextInfo
        }, { quoted: message });
    }
};
