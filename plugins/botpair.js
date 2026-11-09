'use strict';

const { startSubBot } = require('../lib/subbot');
const { resolvePhoneJid } = require('../lib/phone-utils');

module.exports = {
    commands:    ['pair', 'paircode', 'clone', 'getpair', 'subbot'],
    description: 'Connect a sub-bot or clone your WhatsApp directly from DM by typing .pair',
    usage:       '.pair  (in DM) OR .pair <phone_number>',
    permission:  'public',
    group:       true,
    private:     true,

    async run(sock, message, args, ctx) {
        const { sender, jid, reply, prefix } = ctx;

        let targetNumber = args.join('').replace(/\D/g, '');

        // If no number provided in command arguments:
        if (!targetNumber) {
            // If called in a group, tell user to DM or provide their number
            if (jid.endsWith('@g.us')) {
                return reply([
                    `⚡ *TALHA-MD SUB-BOT PAIRING* ⚡`,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                    `Group mein security ki wajah se direct pairing code show nahi hota.`,
                    ``,
                    `💡 *Aasan Tareeqa:*`,
                    `👉 Bot ke *Inbox (DM)* mein ja kar sirf *\`${prefix}pair\`* likhein, code aapke inbox mein aa jayega!`,
                    ``,
                    `👉 Ya yahan apna number likhein:`,
                    `\`${prefix}pair 923xxxxxxxxx\``,
                    `━━━━━━━━━━━━━━━━━━━━━━━━━`
                ].join('\n'));
            }

            // In Private DM: automatically detect the sender's phone number!
            let realJid = sender;
            if (sender.endsWith('@lid')) {
                const resolved = resolvePhoneJid(sender);
                if (resolved) realJid = resolved;
            }

            if (realJid.endsWith('@s.whatsapp.net')) {
                targetNumber = realJid.split('@')[0].split(':')[0].replace(/\D/g, '');
            } else if (!realJid.endsWith('@lid')) {
                targetNumber = realJid.split('@')[0].replace(/\D/g, '');
            }
        }

        // Validate number
        if (!targetNumber || targetNumber.length < 10) {
            return reply([
                `⚡ *TALHA-MD BOT PAIRING* ⚡`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `Apne WhatsApp number ko bot ke sath link karne ke liye:`,
                ``,
                `📌 *Usage:*`,
                `• Agar Inbox (DM) mein hain: sirf *\`${prefix}pair\`* send karein`,
                `• Ya number sath likhein: *\`${prefix}pair 923426767199\`*`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`
            ].join('\n'));
        }

        await reply(
            `⏳ *+${targetNumber} ke liye Pairing Code mangwaya ja raha hai...*\n` +
            `_Barah-e-karam 5-10 seconds intezar karein, code abhi receive ho jayega..._`
        );

        // Keep direct sender JID so response goes directly to the requester chat
        const requestorJid = sender;
        const requestorNum = targetNumber;

        try {
            startSubBot({
                number:       targetNumber,
                requestorJid: requestorJid,
                requestorNum: requestorNum,
                mainSock:     sock,
            }).catch(e => {
                console.error(`[SubBot] startSubBot error for +${targetNumber}: ${e.message}`);
            });

            if (jid.endsWith('@g.us')) {
                await reply(`✅ Pairing code for +${targetNumber} has been sent to your private DM!`);
            }
        } catch (err) {
            reply(`❌ Failed to request pairing code: ${err.message || 'Please try again later'}`);
        }
    }
};
