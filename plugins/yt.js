'use strict';

const { searchYouTube } = require('../lib/youtube-downloader');

module.exports = {
    commands:    ['ytinfo', 'ytdetails'],
    description: 'Fetch metadata and details for a YouTube video or search query',
    usage:       '.ytinfo <url or title>',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(target, {
                text: '🎬 *Usage:* `.ytinfo <YouTube URL or title>`\n\n_Use `.ytmp4` for video download or `.play` / `.ytmp3` for MP3 audio._',
                contextInfo
            }, { quoted: message });
        }
        try {
            const info = await searchYouTube(query);
            const caption = [
                `🎬 *YouTube Details*`,
                `━━━━━━━━━━━━━━━━━━━━`,
                `📌 *Title:* ${info.title}`,
                `👤 *Channel:* ${info.author || 'YouTube'}`,
                info.duration ? `⏱️ *Duration:* ${info.duration}` : '',
                `🔗 *URL:* ${info.url}`,
                `━━━━━━━━━━━━━━━━━━━━`,
                `_Download with \`.ytmp4 ${info.url}\` or \`.ytmp3 ${info.url}\`_`,
            ].filter(Boolean).join('\n');

            if (info.thumbnail) {
                await sock.sendMessage(target, {
                    image: { url: info.thumbnail },
                    caption,
                    contextInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(target, { text: caption, contextInfo }, { quoted: message });
            }
        } catch (err) {
            await sock.sendMessage(target, {
                text: `❌ Could not fetch YouTube info: ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
