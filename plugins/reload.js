'use strict';

module.exports = {
    commands:    ['reload', 'refresh', 'loadplugins'],
    description: 'Reload all plugin files without restarting the bot',
    permission:  'owner',
    group:       true,
    private:     true,

    async run(sock, message, args, ctx) {
        const { reply } = ctx;
        try {
            if (typeof global.reloadPlugins === 'function') {
                const count = global.reloadPlugins();
                return reply(`⚡ *Plugins Reloaded Successfully!*\n\nLoaded *${count}* active plugins into memory.`);
            } else {
                return reply('❌ Plugin reload function not available.');
            }
        } catch (e) {
            return reply(`❌ Error reloading plugins: ${e.message}`);
        }
    }
};
