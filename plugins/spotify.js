'use strict';

const axios = require('axios');
const { searchYouTube, downloadAudio } = require('../lib/youtube-downloader');

async function resolveSpotifyQuery(input) {
    const clean = String(input || '').trim();
    const match = clean.match(/https?:\/\/open\.spotify\.com\/[^\s]+/i);
    if (!match) return clean;

    // Official Spotify oEmbed returns "Song Title" and sometimes "by Artist" cleanly without auth
    try {
        const res = await axios.get('https://open.spotify.com/oembed', {
            params: { url: match[0] },
            headers: { 'User-Agent': 'TALHAMD-Bot/2.0' },
            timeout: 10000,
        });
        const title = String(res.data?.title || '').trim();
        if (title) return title;
    } catch {}

    // Fallback: scrape <title> from Spotify share page
    try {
        const page = await axios.get(match[0], {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TALHAMDBot/2.0)' },
            timeout: 10000,
        });
        const rawTitle = String(page.data || '').match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
        const cleaned = rawTitle.replace(/\s*\|\s*Spotify.*$/i, '').replace(/\s*-\s*song and lyrics by\s+/i, ' - ').trim();
        if (cleaned) return cleaned;
    } catch {}

    return clean;
}

module.exports = {
    commands:    ['spotify', 'spoti', 'spdl'],
    description: 'Download a Spotify link or search and download any song as MP3',
    usage:       '.spotify <song name or Spotify track URL>',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const chatTarget = jid || sender;
        const rawQuery = args.join(' ').trim();
        if (!rawQuery) {
            return sock.sendMessage(chatTarget, {
                text: '🎵 Please provide a song name or Spotify link.\nExample: `.spotify Blinding Lights`',
                contextInfo
            }, { quoted: message });
        }

        const loading = await sock.sendMessage(chatTarget, {
            text: `⏳ _Fetching track audio..._`,
            contextInfo
        }, { quoted: message }).catch(() => null);
        const deleteLoading = () => {
            if (loading?.key) sock.sendMessage(chatTarget, { delete: loading.key }).catch(() => {});
        };

        try {
            const resolvedQuery = await resolveSpotifyQuery(rawQuery);
            const track = await searchYouTube(`${resolvedQuery} audio`);
            const audioResult = await downloadAudio(track.url);
            const audioPayload = audioResult.type === 'buffer'
                ? audioResult.buffer
                : { url: audioResult.url };

            await deleteLoading();

            const title = track.title || resolvedQuery;
            const safeName = title.replace(/[^\w\s-]/g, '').trim().slice(0, 50) || 'spotify_track';
            const caption = `🎵 *${title}*\n👤 ${track.author || 'Spotify / YouTube'}${track.duration ? `  •  ⏱ ${track.duration}` : ''}\n_Powered by TALHA-MD_`;

            if (track.thumbnail) {
                try {
                    await sock.sendMessage(chatTarget, {
                        image: { url: track.thumbnail },
                        caption,
                        contextInfo
                    }, { quoted: message });
                } catch {
                    await sock.sendMessage(chatTarget, { text: caption, contextInfo }, { quoted: message }).catch(() => {});
                }
            } else {
                await sock.sendMessage(chatTarget, { text: caption, contextInfo }, { quoted: message }).catch(() => {});
            }

            try {
                await sock.sendMessage(chatTarget, {
                    audio:    audioPayload,
                    mimetype: audioResult.mimetype || 'audio/mpeg',
                    ptt:      false,
                    contextInfo
                }, { quoted: message });
            } catch (audioErr) {
                await sock.sendMessage(chatTarget, {
                    document: audioPayload,
                    mimetype: audioResult.mimetype || 'audio/mpeg',
                    fileName: safeName + (audioResult.mimetype?.includes('mp4') ? '.m4a' : '.mp3'),
                    contextInfo
                }, { quoted: message });
            }
        } catch (e) {
            await deleteLoading();
            await sock.sendMessage(chatTarget, {
                text: `❌ Song download failed: ${String(e.message).slice(0, 120)}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
