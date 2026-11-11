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

            const mime = audioResult.mimetype || 'audio/mpeg';
            const ext = mime.includes('mp4') ? 'm4a' : 'mp3';

            // Send one playable/downloadable audio message. Only fall back to a
            // document if WhatsApp rejects the audio message; a failed duplicate
            // document must not turn an already delivered song into a false error.
            try {
                await sock.sendMessage(chatTarget, {
                    audio:    audioPayload,
                    mimetype: mime,
                    ptt:      false,
                    contextInfo
                }, { quoted: message });
            } catch (audioErr) {
                const safeName = (track.title || 'song').replace(/[^\\w\\s-]/g, '').trim().slice(0, 50) || 'song';
                await sock.sendMessage(chatTarget, {
                    document: audioPayload,
                    mimetype: mime,
                    fileName: `${safeName}.${ext}`,
                    contextInfo
                }, { quoted: message });
            }

        } catch (err) {
            await sock.sendMessage(chatTarget, {
                text: `❌ *Song Download Failed:* ${err.message || 'Please try another song title.'}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
