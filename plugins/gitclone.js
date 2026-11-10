'use strict';

const axios = require('axios');
const { getStr } = require('../lib/theme');
const GH_REGEX = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;

module.exports = {
    commands:    ['gitclone'],
    description: 'Download a GitHub repository as a ZIP file',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, groupId, sender, contextInfo }) => {
        const chatId = jid || groupId || sender;
        if (!args[0]) {
            return sock.sendMessage(chatId, {
                text: `❌ Please provide a GitHub URL.\nExample: .gitclone https://github.com/talhahafiz236/talha-md`,
                contextInfo
            }, { quoted: message });
        }

        if (!GH_REGEX.test(args[0])) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Invalid GitHub link.',
                contextInfo
            }, { quoted: message });
        }

        const [, user, repo] = args[0].match(GH_REGEX);
        const cleanRepo = repo.replace(/\.git$/, '');
        const url = `https://api.github.com/repos/${user}/${cleanRepo}/zipball`;

        await sock.sendMessage(chatId, {
            text: '✳️ Fetching repository, please wait...',
            contextInfo
        }, { quoted: message });

        try {
            const response = await axios.head(url, {
                timeout: 12000,
                maxRedirects: 5,
                headers: { 'User-Agent': 'TALHA-MD-Bot/2.0' }
            });
            const cd       = response.headers['content-disposition'] || '';
            const filename = cd.match(/attachment; filename=(.*)/)?.[1] || `${cleanRepo}.zip`;

            await sock.sendMessage(chatId, {
                document: { url },
                fileName: filename,
                mimetype: 'application/zip',
                caption:  `📦 *${user}/${cleanRepo}*\n_Downloaded via ${getStr('botName') || 'TALHA MD'}_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[GitClone]', err.message);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to download repository.\n${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
