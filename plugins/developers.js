'use strict';

const config = require('../config');

module.exports = {
    commands: ['developers', 'devs', 'devcontact'],
    description: 'Show bot developer contacts',
    usage: '.developers',
    permission: 'public',
    group: true,
    private: true,
    run: async (sock, message, args, ctx) => {
        return ctx.reply(
            `┌───「 👨‍💻 *TALHA-MD DEVELOPER* 」───\n` +
            `│ 👑 *Developer:* ${config.OWNER_NAME || 'Talha Sheikh'}\n` +
            `│ 📱 *WhatsApp:* +${config.OWNER_NUMBER || '923426767199'}\n` +
            `│ ⚡ *Project:* TALHA MD Multi-Device Agent\n` +
            `└───────────────────────────────────\n\n` +
            `_⚡ Developed & Maintained by Talha Sheikh_`
        );
    }
};
