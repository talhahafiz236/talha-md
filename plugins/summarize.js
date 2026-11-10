'use strict';

const axios = require('axios');
const gemini = require('../lib/gemini');

function extractUrl(text) {
    const match = String(text || '').match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
    return match ? match[0].replace(/[),.!?]+$/, '') : null;
}

async function fetchPageText(url) {
    const res = await axios.get(url, {
        headers: { 'User-Agent': 'TALHAMD-Bot/2.0 (compatible)' },
        timeout: 10000,
        maxContentLength: 200000,
    });
    const html = typeof res.data === 'string' ? res.data : '';
    const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]?.trim() || '';
    const desc = (html.match(/<meta[^>]*(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']+)["']/i) || [])[1]?.trim() || '';
    const bodyText = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return { title, desc, bodyText };
}

module.exports = {
    commands:    ['summarize', 'summary', 'tldr', 'brief'],
    description: 'AI summarizes any long text, article URL, or quoted message',
    usage:       '.summarize <text or url> OR reply to a long message',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { reply, safeSend } = ctx;

        const quoted = message.message?.extendedTextMessage?.contextInfo;
        const quotedText = quoted?.quotedMessage?.conversation
            || quoted?.quotedMessage?.extendedTextMessage?.text
            || quoted?.quotedMessage?.imageMessage?.caption
            || quoted?.quotedMessage?.videoMessage?.caption
            || '';

        const rawInput = args.join(' ').trim() || quotedText.trim();

        if (!rawInput) {
            return reply(
                `📝 *Summarizer*\n\n` +
                `Reply to any long message with \`.summarize\` to get a quick summary, or pass a webpage URL or text directly.\n\n` +
                `*Examples:*\n` +
                `• \`.summarize The quick brown fox...\`\n` +
                `• \`.tldr https://example.com/article\`\n\n` +
                `_Aliases: .tldr  .brief  .summary_`
            );
        }

        await safeSend({ text: `📝 _Summarizing..._` }, { quoted: message });

        let textToSummarize = rawInput;
        let sourceTitle = '';
        const url = extractUrl(rawInput);
        if (url && rawInput.length < 220) {
            try {
                const page = await fetchPageText(url);
                sourceTitle = page.title;
                const combined = [page.title, page.desc, page.bodyText].filter(Boolean).join('\n\n');
                if (combined.length >= 80) textToSummarize = combined;
            } catch {}
        }

        if (textToSummarize.length < 80) {
            return reply(`⚠️ The text is too short to summarize (${textToSummarize.length} chars). Provide longer text or a valid article URL.`);
        }

        const prompt = `Summarize the following content in 3-5 clear, concise bullet points:\n\n${textToSummarize.slice(0, 4000)}`;

        try {
            const summary = await gemini.ask(prompt, 'You are an expert summarizer. Output concise bullet points only.');
            if (summary && summary.trim().length > 10) {
                const header = sourceTitle ? `📝 *Summary: ${sourceTitle.slice(0, 80)}*` : `📝 *Summary*`;
                return reply(`${header}\n\n${summary.trim()}`);
            }
        } catch { /* fall through to extractive fallback */ }

        const sentences = textToSummarize
            .replace(/\s+/g, ' ')
            .split(/(?<=[.!?])\s+/)
            .filter(s => s.length > 20);

        const maxSentences = Math.min(5, Math.max(1, Math.ceil(sentences.length * 0.3)));
        const extracted = sentences.slice(0, maxSentences).join(' ') || textToSummarize.slice(0, 500);

        reply(
            `📝 *Summary* _(extracted)_\n\n${extracted}\n\n` +
            `_Original: ${textToSummarize.length} chars → Summary: ${extracted.length} chars_`
        );
    },
};
