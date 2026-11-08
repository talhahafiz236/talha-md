'use strict';

const { searchYouTube, downloadAudio } = require('../lib/youtube-downloader');

module.exports = {
    commands:    ['play', 'music', 'song', 'ytsong', 'ytaudio'],
    description: 'Search and download any song from YouTube as MP3',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo, reply, jid }) => {
        const query = args.join(' ').trim();
        const chatTarget = jid || sender;

        if (!query) {
            return sock.sendMessage(chatTarget, {
                text: '🎵 *Usage:* `.play <song name or YouTube link>`\n\n💡 *Example:* `.play Pasoori Ali Sethi`',
                contextInfo
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(chatTarget, {
                text: `🔍 *Searching YouTube for:* _"${query}"_...`,
                contextInfo
            }, { quoted: message });

            const track = await searchYouTube(query);

            const searchCard = [
                `🎵 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗠𝗨𝗦𝗜𝗖 𝗣𝗟𝗔𝗬𝗘𝗥*`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `🎶 *Track:* ${track.title}`,
                `🎤 *Artist:* ${track.author || 'YouTube'}`,
                track.duration ? `⏱ *Duration:* ${track.duration}` : '',
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `⏳ *Downloading audio stream...*`
            ].filter(Boolean).join('\n');

            if (track.thumbnail) {
                try {
                    await sock.sendMessage(chatTarget, {
                        image:   { url: track.thumbnail },
                        caption: searchCard,
                        contextInfo
                    }, { quoted: message });
                } catch (_) {}
            }

            const audioResult = await downloadAudio(track.url);
            const audioPayload = audioResult.type === 'buffer' 
                ? audioResult.buffer 
                : { url: audioResult.url };

            // 1. Send Playable Voice Audio
            await sock.sendMessage(chatTarget, {
                audio:    audioPayload,
                mimetype: 'audio/mp4',
                ptt:      false,
                contextInfo
            }, { quoted: message });

            // 2. Send Downloadable MP3 Document with Clean Title
            const safeName = (track.title || 'song').replace(/[^\w\s-]/g, '').trim().slice(0, 50);
            await sock.sendMessage(chatTarget, {
                document: audioPayload,
                mimetype: 'audio/mpeg',
                fileName: `${safeName}.mp3`,
                contextInfo
            }, { quoted: message });

        } catch (err) {
            await sock.sendMessage(chatTarget, {
                text: `❌ *Song Download Failed:* ${err.message || 'Please try another song title.'}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
