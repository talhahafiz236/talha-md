'use strict';

const { searchYouTube, downloadVideo } = require('../lib/youtube-downloader');

module.exports = {
    commands:    ['ytmp4', 'ytvideo', 'ytv', 'yt', 'youtube', 'video'],
    description: 'Download YouTube video in MP4 HD',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo, jid }) => {
        const query = args.join(' ').trim();
        const chatTarget = jid || sender;

        if (!query) {
            return sock.sendMessage(chatTarget, {
                text: '🎬 *Usage:* `.ytmp4 <YouTube link or video title>`\n\n💡 *Example:* `.video Coke Studio Pasoori`',
                contextInfo
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(chatTarget, {
                text: `⏳ *Fetching video...*`,
                contextInfo
            }, { quoted: message });

            const track = await searchYouTube(query);
            const videoResult = await downloadVideo(track.url);
            const videoPayload = videoResult.type === 'buffer' 
                ? videoResult.buffer 
                : { url: videoResult.url };

            const caption = [
                `🎬 *${track.title}*`,
                track.author ? `👤 *Channel:* ${track.author}` : '',
                track.duration ? `⏱ *Duration:* ${track.duration}` : '',
                ``,
                `⚡ _Downloaded via TALHA-MD Core_`
            ].filter(Boolean).join('\n');

            await sock.sendMessage(chatTarget, {
                video:    videoPayload,
                caption,
                mimetype: 'video/mp4',
                contextInfo
            }, { quoted: message });

        } catch (err) {
            await sock.sendMessage(chatTarget, {
                text: `❌ *Video Download Failed:* ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
