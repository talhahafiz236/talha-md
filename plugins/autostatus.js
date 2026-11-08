'use strict';

// Runtime toggles — override config values without editing config.env
// Read by silva.js status handler when present
global.autoStatusFlags = {
    seen:  false,
    react: false,
};

const FLAGS = global.autoStatusFlags;

module.exports = {
    commands:    ['autoview', 'autolike', 'autoreact', 'autostatus', 'statusconfig'],
    description: 'Control automatic status viewing and liking at runtime',
    usage:       '.autoview on/off  |  .autolike on/off  |  .autostatus',
    permission:  'owner',
    group:       false,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;

        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();

        const sub = (args[0] || '').toLowerCase();

        // ── .autostatus / .statusconfig — show current state ─────────────────
        if (rawCmd === 'autostatus' || rawCmd === 'statusconfig') {
            const config = require('../config');
            const seenEff  = FLAGS.seen  !== null ? FLAGS.seen  : config.AUTO_STATUS_SEEN;
            const reactEff = FLAGS.react !== null ? FLAGS.react : config.AUTO_STATUS_REACT;
            const seenSrc  = FLAGS.seen  !== null ? '_(runtime override)_' : '_(from config)_';
            const reactSrc = FLAGS.react !== null ? '_(runtime override)_' : '_(from config)_';

            return sock.sendMessage(jid, {
                text: [
                    `📊 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗔𝗨𝗧𝗢-𝗦𝗧𝗔𝗧𝗨𝗦 𝗖𝗢𝗡𝗧𝗥𝗢𝗟*`,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                    `👁️ *Auto View:*   ${seenEff  ? '[🟢 ON ]' : '[🔴 OFF]'}  ${seenSrc}`,
                    `❤️ *Auto Like:*   ${reactEff ? '[🟢 ON ]' : '[🔴 OFF]'}  ${reactSrc}`,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                    `💡 *Control Commands:*`,
                    `• \`.autoview on\`   — Turn on auto viewing`,
                    `• \`.autoview off\`  — Turn off auto viewing`,
                    `• \`.autolike on\`   — Turn on auto emoji reaction`,
                    `• \`.autolike off\`  — Turn off auto emoji reaction`,
                    `• \`.autostatus\`    — Check current state`,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                    `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
                ].join('\n'),
                contextInfo
            }, { quoted: message });
        }

        // ── .autoview on/off ──────────────────────────────────────────────────
        if (rawCmd === 'autoview') {
            if (sub !== 'on' && sub !== 'off') {
                const config = require('../config');
                const eff = FLAGS.seen !== null ? FLAGS.seen : config.AUTO_STATUS_SEEN;
                return sock.sendMessage(jid, {
                    text: `👁️ *Auto View* is currently *${eff ? 'ON' : 'OFF'}*\n\nUsage: \`.autoview on\` or \`.autoview off\``,
                    contextInfo
                }, { quoted: message });
            }
            FLAGS.seen = sub === 'on';
            return sock.sendMessage(jid, {
                text: FLAGS.seen
                    ? `👁️ *Auto View: ON*\n\n✅ Bot will now *view every status* as soon as it arrives — no exceptions.`
                    : `👁️ *Auto View: OFF*\n\n❌ Bot will stop automatically viewing statuses.`,
                contextInfo
            }, { quoted: message });
        }

        // ── .autolike / .autoreact on/off ─────────────────────────────────────
        if (rawCmd === 'autolike' || rawCmd === 'autoreact') {
            if (sub !== 'on' && sub !== 'off') {
                const config = require('../config');
                const eff = FLAGS.react !== null ? FLAGS.react : config.AUTO_STATUS_REACT;
                return sock.sendMessage(jid, {
                    text: `❤️ *Auto Like* is currently *${eff ? 'ON' : 'OFF'}*\n\nUsage: \`.autolike on\` or \`.autolike off\``,
                    contextInfo
                }, { quoted: message });
            }
            FLAGS.react = sub === 'on';
            return sock.sendMessage(jid, {
                text: FLAGS.react
                    ? `❤️ *Auto Like: ON*\n\n✅ Bot will now *react to every status* with an emoji — no exceptions.`
                    : `❤️ *Auto Like: OFF*\n\n❌ Bot will stop automatically reacting to statuses.`,
                contextInfo
            }, { quoted: message });
        }
    }
};
