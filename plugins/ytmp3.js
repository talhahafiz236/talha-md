'use strict';

const { searchYouTube, downloadAudio } = require('../lib/youtube-downloader');

module.exports = {
    commands:    ['ytmp3', 'ytvid-audio', 'ytaudio2'],
    description: 'Download YouTube audio as MP3 by URL or song name',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo, jid }) => {
        const query = args.join(' ').trim();
        const chatTarget = jid || sender;

        if (!query) {
            return sock.sendMessage(chatTarget, {
                text: '🎵 *Usage:* `.ytmp3 <YouTube link or song name>`',
                contextInfo
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(chatTarget, {
                text: `⏳ *Fetching MP3 audio...*`,
                contextInfo
            }, { quoted: message });

            const track = await searchYouTube(query);
            const audioResult = await downloadAudio(track.url);
            const audioPayload = audioResult.type === 'buffer' 
                ? audioResult.buffer 
                : { url: audioResult.url };

            const safeName = (track.title || 'song').replace(/[^\w\s-]/g, '').trim().slice(0, 50) || 'song';
            const mime = audioResult.mimetype || 'audio/mpeg';
            const ext = mime.includes('mp4') ? 'm4a' : 'mp3';

            await sock.sendMessage(chatTarget, {
                audio:    audioPayload,
                mimetype: mime,
                ptt:      false,
                contextInfo
            }, { quoted: message });

            await sock.sendMessage(chatTarget, {
                document: audioPayload,
                mimetype: mime,
                fileName: `${safeName}.${ext}`,
                contextInfo
            }, { quoted: message });

        } catch (err) {
            await sock.sendMessage(chatTarget, {
                text: `❌ *YTMP3 Failed:* ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
