'use strict';

const { fmt } = require('../lib/theme');
const { startSubBot } = require('../lib/subbot');
const { resolvePhoneJid } = require('../lib/phone-utils');

module.exports = {
    commands:    ['getcode', 'sessioncode', 'connectbot'],
    description: 'Generate a WhatsApp pair code directly via TALHA-MD sub-bot engine',
    usage:       '.getcode 923XXXXXXXXX',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { sender, jid, contextInfo, reply, prefix } = ctx;
        const pfx = prefix || '.';
        let rawNumber = args.join('').replace(/\D/g, '');

        if (!rawNumber && jid && !jid.endsWith('@g.us')) {
            let realJid = sender;
            if (sender.endsWith('@lid')) {
                const resolved = resolvePhoneJid(sender);
                if (resolved) realJid = resolved;
            }
            if (realJid.endsWith('@s.whatsapp.net')) {
                rawNumber = realJid.split('@')[0].split(':')[0].replace(/\D/g, '');
            }
        }

        if (!rawNumber || rawNumber.length < 10) {
            const publicUrl = process.env.PUBLIC_URL || 'https://talha-md.onrender.com';
            return reply(fmt(
                `🔗 *Get WhatsApp Pair Code*\n\n` +
                `Enter your phone number (with country code) to get an 8-digit pairing code directly:\n\n` +
                `*Usage:*\n` +
                `• \`${pfx}getcode 923XXXXXXXXX\`\n` +
                `• \`${pfx}pair 923XXXXXXXXX\`\n` +
                `• Or open ${publicUrl}/qr\n\n` +
                `_Codes expire in ~60 seconds — enter promptly in WhatsApp → Linked Devices._`
            ));
        }

        await reply(fmt(`⏳ Generating pair code for +${rawNumber}…\n_Please wait 5–10 seconds…_`));

        try {
            startSubBot({
                number:       rawNumber,
                requestorJid: sender,
                requestorNum: rawNumber,
                mainSock:     sock,
            }).catch(e => {
                console.error(`[GetCode] startSubBot error for +${rawNumber}: ${e.message}`);
            });

            if (jid?.endsWith('@g.us')) {
                await sock.sendMessage(jid, {
                    text: fmt(`✅ Pairing code for +${rawNumber} will be delivered directly to your DM!`),
                    contextInfo,
                }, { quoted: message });
            }
        } catch (err) {
            reply(fmt(`❌ Failed to request pair code: ${err.message}`));
        }
    }
};
