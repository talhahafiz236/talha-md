'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qs = require('querystring');
const { extractMessageText } = require('../lib/message-utils');
const { searchYouTube, downloadAudio, downloadVideo } = require('../lib/youtube-downloader');
const { downloadTikTok } = require('./tiktok');
const { resolveFacebook } = require('./facebook');
const { resolveTwitterMedia } = require('./twitter');

const SUPPORTED_HOSTS = /(?:youtube\.com|youtu\.be|tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|t\.co|pinterest\.com|pin\.it|soundcloud\.com)/i;
const MAX_URL_LENGTH = 2048;
const AUTO_DOWNLOAD_FILE = path.join(__dirname, '..', 'data', 'auto-download.json');
const autoDownloadChats = new Set();

try {
    const saved = JSON.parse(fs.readFileSync(AUTO_DOWNLOAD_FILE, 'utf8'));
    for (const [jid, enabled] of Object.entries(saved || {})) if (enabled) autoDownloadChats.add(jid);
} catch { /* first run */ }

function saveAutoDownloadSettings() {
    try {
        fs.mkdirSync(path.dirname(AUTO_DOWNLOAD_FILE), { recursive: true });
        fs.writeFileSync(AUTO_DOWNLOAD_FILE, JSON.stringify(Object.fromEntries([...autoDownloadChats].map(jid => [jid, true])), null, 2));
    } catch (error) { console.warn(`[AutoDownload] settings save failed: ${error.message}`); }
}

function extractUrl(text) {
    const match = String(text || '').match(/(?:https?:\/\/)?(?:www\.|m\.|vt\.|vm\.)?(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|pinterest\.com|soundcloud\.com)\/[^\s<>]*/i);
    if (!match) return '';
    const value = match[0].replace(/[),.!?]+$/, '');
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function quotedInput(message) {
    const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage
        || message?.message?.imageMessage?.contextInfo?.quotedMessage
        || message?.message?.videoMessage?.contextInfo?.quotedMessage;
    return extractMessageText(quoted) || message?.message?.extendedTextMessage?.contextInfo?.externalAdReply?.sourceUrl || '';
}

async function resolveMedia(url, format = 'mp4') {
    // 1. YouTube -> lib/youtube-downloader.js
    if (/(?:youtube\.com|youtu\.be)/i.test(url)) {
        const track = await searchYouTube(url);
        if (format === 'mp3') {
            const audio = await downloadAudio(track.url);
            return {
                buffer: audio.buffer,
                url: audio.url,
                type: 'audio',
                mimetype: audio.mimetype || 'audio/mpeg',
                title: track.title || 'YouTube Audio',
                platform: 'YouTube',
            };
        }
        const video = await downloadVideo(track.url);
        return {
            buffer: video.buffer,
            url: video.url,
            type: 'video',
            mimetype: 'video/mp4',
            title: track.title || 'YouTube Video',
            platform: 'YouTube',
        };
    }

    // 2. TikTok -> tiktok.js resolver
    if (/tiktok\.com/i.test(url)) {
        const tt = await downloadTikTok(url);
        if (tt) {
            return {
                url: (format === 'mp3' && tt.audioUrl) ? tt.audioUrl : tt.videoUrl,
                filePath: tt.filePath,
                type: (format === 'mp3' && tt.audioUrl) ? 'audio' : 'video',
                title: tt.title || 'TikTok Video',
                platform: 'TikTok',
                author: tt.author || 'TikTok',
            };
        }
    }

    // 3. Facebook -> facebook.js resolver (fb-downloader-scrapper -> alldl -> yt-dlp)
    if (/(?:facebook\.com|fb\.watch)/i.test(url)) {
        const fb = await resolveFacebook(url);
        if (fb) {
            return {
                url: fb.videoUrl,
                filePath: fb.filePath,
                type: 'video',
                title: fb.title || 'Facebook Video',
                platform: 'Facebook',
            };
        }
    }

    // 4. Twitter/X -> vxtwitter/fxtwitter/yt-dlp
    if (/(?:twitter\.com|x\.com|t\.co)/i.test(url)) {
        const tw = await resolveTwitterMedia(url);
        const first = tw?.items?.[0];
        if (first) {
            return {
                url: first.url,
                filePath: first.filePath,
                type: first.type === 'image' ? 'image' : 'video',
                title: 'X / Twitter Media',
                platform: 'Twitter/X',
            };
        }
    }

    // 5. SoundCloud -> soundcloud.js resolver
    if (/soundcloud\.com/i.test(url)) {
        try {
            const { resolveSoundCloud } = require('./soundcloud');
            const sc = await resolveSoundCloud(url);
            if (sc?.audioUrl || sc?.filePath) {
                return {
                    url: sc.audioUrl,
                    filePath: sc.filePath,
                    type: 'audio',
                    title: sc.title || 'SoundCloud Track',
                    platform: 'SoundCloud',
                };
            }
        } catch {}
    }

    // 6. Instagram / Pinterest / Generic -> rahad-all-downloader-v2
    try {
        const { alldl } = require('rahad-all-downloader-v2');
        const res = await alldl(url);
        if (res?.data) {
            const d = res.data;
            const chosen = (format === 'mp3' && d.download?.audio)
                ? d.download.audio
                : (d.download?.video || d.videoUrl || d.download?.image || d.url);
            if (chosen) {
                const isImg = !(/\.mp4/i.test(chosen) || d.download?.video || d.videoUrl) && /\.(?:jpe?g|png|webp)/i.test(chosen);
                return {
                    url: chosen,
                    type: format === 'mp3' ? 'audio' : (isImg ? 'image' : 'video'),
                    title: d.title || 'Social Media Content',
                    platform: d.source || 'Social Media'
                };
            }
        }
    } catch (_) {}

    // 7. Pinterest oEmbed image fallback
    if (/pinterest\.com|pin\.it/i.test(url)) {
        try {
            const res = await axios.get(`https://www.pinterest.com/oembed.json?url=${encodeURIComponent(url)}`, { timeout: 10000 });
            if (res.data?.thumbnail_url) {
                return {
                    url: res.data.thumbnail_url,
                    type: 'image',
                    title: res.data.title || 'Pinterest Media',
                    platform: 'Pinterest',
                };
            }
        } catch {}
    }

    return null;
}

module.exports = {
    commands: ['download', 'dl', 'socialdl', 'universal', 'autodl'],
    description: 'Download social media and optionally auto-send MP4 video plus MP3 audio',
    usage: '.download <url> [mp3|mp4] | .autodl on|off|status',
    permission: 'public',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const { sender, contextInfo, prefix = '.', reply, jid, isGroup, isAdmin, isOwner, silent } = ctx;
        const chatTarget = jid || sender;
        const command = String(ctx.command || '').toLowerCase();
        if (command === 'autodl') {
            if (isGroup ? (!isAdmin && !isOwner) : !isOwner) {
                return reply('⛔ *Only group admins or the owner can change auto-download settings.*');
            }
            const action = String(args[0] || 'status').toLowerCase();
            if (action === 'on' || action === 'enable') {
                autoDownloadChats.add(jid); saveAutoDownloadSettings();
                return reply('✅ *Auto-download enabled!* Public social links will be downloaded automatically.');
            }
            if (action === 'off' || action === 'disable') {
                autoDownloadChats.delete(jid); saveAutoDownloadSettings();
                return reply('⏸️ *Auto-download disabled for this chat.*');
            }
            return reply(`📥 *Auto-download is currently [${autoDownloadChats.has(jid) ? '🟢 ON' : '🔴 OFF'}] for this chat.*\n\n💡 Use \`${prefix}autodl on\` or \`${prefix}autodl off\`.`);
        }

        const argumentInput = args.join(' ').trim().replace(/^(?:download|dl|socialdl|universal)\s+/i, '');
        const quoted = quotedInput(message);
        const input = (argumentInput || quoted).trim();
        const url = extractUrl(input) || extractUrl(quoted);
        const formatArg = (args.at(-1) || '').toLowerCase();
        const format = formatArg === 'mp3' || formatArg === 'mp4' ? formatArg : 'mp4';

        if (!url || url.length > MAX_URL_LENGTH) {
            return reply([
                `📥 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗔𝗟 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `💡 *Usage:* \`${prefix}download <url> [mp3|mp4]\``,
                `💡 *Example:* \`${prefix}dl https://vt.tiktok.com/ZS...\``,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `✨ *Supported Platforms:* YouTube, TikTok, Instagram, Facebook, Pinterest, SoundCloud, X/Twitter.`
            ].join('\n'));
        }

        if (!SUPPORTED_HOSTS.test(url)) {
            return reply('❌ *Unsupported link.* Supported: YouTube, TikTok, Instagram, Facebook, Pinterest, SoundCloud, and X.');
        }

        if (!silent) await reply(`⏳ *Resolving media stream as ${format.toUpperCase()}...*`);

        let media = null;
        try {
            media = await resolveMedia(url, format);
        } catch (err) {
            console.warn(`[UniversalDownloader] resolve failed: ${err.message}`);
        }

        if (!media || (!media.url && !media.buffer && !media.filePath)) {
            return reply('❌ *Could not resolve download link.* The post may be private or removed.');
        }

        const caption = [
            `📥 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗔𝗟 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 *Title:* ${(media.title || 'Media').slice(0, 80)}`,
            `🌐 *Platform:* ${media.platform}`,
            `📦 *Format:* ${format.toUpperCase()}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `👑 *Owner:* Talha Sheikh`,
            `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
        ].join('\n');

        let payload = null;
        if (media.buffer) payload = media.buffer;
        else if (media.filePath && fs.existsSync(media.filePath)) payload = fs.readFileSync(media.filePath);
        else payload = { url: media.url };

        try {
            if (media.type === 'audio' || format === 'mp3') {
                await sock.sendMessage(chatTarget, {
                    audio: payload,
                    mimetype: media.mimetype || 'audio/mpeg',
                    ptt: false,
                    contextInfo
                }, { quoted: message });
            } else if (media.type === 'image') {
                await sock.sendMessage(chatTarget, {
                    image: payload,
                    caption,
                    contextInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatTarget, {
                    video: payload,
                    mimetype: 'video/mp4',
                    caption,
                    contextInfo
                }, { quoted: message });
            }
        } catch (error) {
            console.warn(`[UniversalDownloader] send failed: ${error.message}`);
            return reply('❌ *Sending failed.* Media link may have expired or requires direct browser access.');
        } finally {
            if (media.filePath) {
                try { if (fs.existsSync(media.filePath)) fs.unlinkSync(media.filePath); } catch {}
            }
        }
    },

    onMessage: async (sock, message, text, ctx) => {
        if (!ctx?.jid || !autoDownloadChats.has(ctx.jid) || message?.key?.fromMe) return;
        const input = String(text || '').trim();
        if (!input || /^[^a-zA-Z0-9]/.test(input) || /^(?:hey\s+)?(?:talha|agent|download|dl|autodl)\b/i.test(input)) return;
        const url = extractUrl(input);
        if (!url) return;
        if (typeof ctx.reply === 'function') await ctx.reply('⏳ *Auto-download detected. Fetching media...*');
        await module.exports.run(sock, message, [url, 'mp4'], { ...ctx, silent: true, command: 'download' });
    },

    isAutoDownloadEnabled: jid => autoDownloadChats.has(jid)
};
