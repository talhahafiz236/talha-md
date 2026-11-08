'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

module.exports = {
    commands:    ['setchannel', 'channel', 'mychannel', 'linkchannel'],
    description: 'Connect your WhatsApp Channel so "View Channel" opens your channel',
    permission:  'owner',
    group:       true,
    private:     true,

    async run(sock, message, args, ctx) {
        const { reply, sender } = ctx;
        const input = (args[0] || '').trim();

        if (!input) {
            const currentJid = global.forwardedNewsletter?.newsletterJid || config.NEWSLETTER_JID || 'Not set';
            const currentName = global.forwardedNewsletter?.newsletterName || config.NEWSLETTER_NAME || 'Not set';
            const currentUrl = config.CHANNEL_URL || 'Not set';

            return reply(
                `📢 *TALHA-MD WHATSAPP CHANNEL LINKING*\n\n` +
                `📌 *Current Channel Name:* ${currentName}\n` +
                `🆔 *Current Channel JID:* \`${currentJid}\`\n` +
                `🔗 *Current Link:* ${currentUrl}\n\n` +
                `*Apna Channel Connect Karne Ka Tareeqa:*\n` +
                `Apna channel link is tarah send karein:\n` +
                `• \`.setchannel https://whatsapp.com/channel/xxxxxx\`\n\n` +
                `_Connect karne ke baad bot ke har message par "View Channel" par click karne se aapka channel open hoga!_`
            );
        }

        // Extract code from link
        let code = input;
        if (input.includes('/channel/')) {
            code = input.split('/channel/')[1].split(/[\/\?#]/)[0];
        }

        if (!code || code.length < 5) {
            return reply('❌ Invalid Channel Link. Link is tarah ka hona chahiye:\n`https://whatsapp.com/channel/0029Va...`');
        }

        await reply('🔍 WhatsApp servers se aapke channel ki details verify ki ja rahi hain...');

        try {
            if (typeof sock.newsletterMetadata !== 'function') {
                return reply('❌ WhatsApp socket newsletter metadata function is not available.');
            }

            const meta = await sock.newsletterMetadata('INVITE', code);

            if (!meta || !meta.id) {
                return reply('❌ Channel verify nahi ho saka. Barah-e-karam check karein ke channel link theek hai aur channel public hai.');
            }

            // Successfully fetched metadata!
            const jid = meta.id;
            const name = meta.name || meta.thread_metadata?.name?.text || config.BOT_NAME || '⚡ TALHA-MD OFFICIAL ⚡';
            const fullUrl = `https://whatsapp.com/channel/${code}`;

            // 1. Update in-memory
            if (!global.forwardedNewsletter) global.forwardedNewsletter = {};
            global.forwardedNewsletter.newsletterJid = jid;
            global.forwardedNewsletter.newsletterName = name;
            global.forwardedNewsletter.serverMessageId = 100;

            config.NEWSLETTER_JID = jid;
            config.NEWSLETTER_NAME = name;
            config.CHANNEL_URL = fullUrl;
            process.env.NEWSLETTER_JID = jid;
            process.env.NEWSLETTER_NAME = name;
            process.env.CHANNEL_URL = fullUrl;

            // 2. Persist to config.env
            try {
                const envPath = path.join(__dirname, '../config.env');
                let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

                // Replace or append
                if (envContent.includes('CHANNEL_URL=')) {
                    envContent = envContent.replace(/CHANNEL_URL=.*/g, `CHANNEL_URL=${fullUrl}`);
                } else {
                    envContent += `\nCHANNEL_URL=${fullUrl}`;
                }

                if (envContent.includes('NEWSLETTER_JID=')) {
                    envContent = envContent.replace(/NEWSLETTER_JID=.*/g, `NEWSLETTER_JID=${jid}`);
                } else {
                    envContent += `\nNEWSLETTER_JID=${jid}`;
                }

                if (envContent.includes('NEWSLETTER_NAME=')) {
                    envContent = envContent.replace(/NEWSLETTER_NAME=.*/g, `NEWSLETTER_NAME=${name}`);
                } else {
                    envContent += `\nNEWSLETTER_NAME=${name}`;
                }

                fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
            } catch (err) {
                console.error('[SetChannel] Error saving to config.env:', err.message);
            }

            return reply(
                `🎉 *Aapka Channel Kamyabi Se Connect Ho Chuka Hai!*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📢 *Channel Name:* ${name}\n` +
                `🆔 *Channel JID:* \`${jid}\`\n` +
                `👥 *Subscribers:* ${meta.subscribers || 'Active'}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `✅ Ab bot ke har message ke upar *View Channel* par tap karne se seedha *aapka channel* open hoga!`
            );

        } catch (error) {
            return reply(`❌ Error connecting channel: ${error.message || error}`);
        }
    }
};
