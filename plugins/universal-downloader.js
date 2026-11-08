'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const qs = require('querystring');
const { extractMessageText } = require('../lib/message-utils');

const SUPPORTED_HOSTS = /(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|pinterest\.com)/i;
const MAX_URL_LENGTH = 2048;
const MAX_QUERY_LENGTH = 200;
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
    const match = String(text || '').match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com|pinterest\.com)\/[^\s<>]*/i);
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
    // 1. If TikTok -> TikWM POST is ultra fast and reliable
    if (/tiktok\.com/.test(url)) {
        try {
            const res = await axios.post('https://tikwm.com/api/', qs.stringify({ url }), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 20000
            });
            if (res.data?.code === 0 && res.data?.data) {
                const d = res.data.data;
                return {
                    url: (format === 'mp3' && d.music) ? d.music : d.play,
                    type: format === 'mp3' ? 'audio' : 'video',
                    title: d.title || 'TikTok Video',
                    platform: 'TikTok',
                    author: d.author?.nickname || 'TikTok'
                };
            }
        } catch (_) {}
    }

    // 2. If Facebook -> Siputzx is ultra fast
    if (/facebook\.com|fb\.watch/.test(url)) {
        try {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, { timeout: 15000 });
            if (res.data?.status && res.data?.data?.downloads?.length) {
                const hd = res.data.data.downloads.find(x => x.quality === 'HD') || res.data.data.downloads[0];
                return {
                    url: hd.url,
                    type: 'video',
                    title: res.data.data.title || 'Facebook Video',
                    platform: 'Facebook'
                };
            }
        } catch (_) {}
    }

    // 3. Multi-platform solver with rahad-all-downloader-v2
    try {
        const { alldl } = require('rahad-all-downloader-v2');
        const res = await alldl(url);
        if (res?.data) {
            const d = res.data;
            const chosen = (format === 'mp3' && d.download?.audio) 
                ? d.download.audio 
                : (d.download?.video || d.videoUrl || d.url);
            if (chosen) {
                return {
                    url: chosen,
                    type: format === 'mp3' ? 'audio' : 'video',
                    title: d.title || 'Social Media Content',
                    platform: d.source || 'Social Media'
                };
            }
        }
    } catch (_) {}

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

        if (!url || (url && url.length > MAX_URL_LENGTH)) {
            return reply([
                `📥 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗔𝗟 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `💡 *Usage:* \`${prefix}download <url> [mp3|mp4]\``,
                `💡 *Example:* \`${prefix}dl https://vt.tiktok.com/ZS...\``,
                `━━━━━━━━━━━━━━━━━━━━━━━━━`,
                `✨ *Supported Platforms:* YouTube, TikTok, Instagram, Facebook, Pinterest, X/Twitter.`
            ].join('\n'));
        }

        if (url && !SUPPORTED_HOSTS.test(url)) {
            return reply('❌ *Unsupported link.* Supported: YouTube, TikTok, Instagram, Facebook, Pinterest, and X.');
        }

        if (!silent) await reply(`⏳ *Resolving media stream as ${format.toUpperCase()}...*`);

        const media = await resolveMedia(url, format);
        if (!media?.url) {
            return reply('❌ *Could not resolve download link.* The post may be private or removed.');
        }

        const caption = [
            `📥 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗔𝗟 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 *Title:* ${media.title.slice(0, 80)}`,
            `🌐 *Platform:* ${media.platform}`,
            `📦 *Format:* ${format.toUpperCase()}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `👑 *Owner:* Talha Sheikh`,
            `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
        ].join('\n');

        try {
            if (media.type === 'audio' || format === 'mp3') {
                await sock.sendMessage(sender, {
                    audio: { url: media.url },
                    mimetype: 'audio/mpeg',
                    contextInfo
                }, { quoted: message });
            } else {
                await sock.sendMessage(sender, {
                    video: { url: media.url },
                    caption,
                    contextInfo
                }, { quoted: message });
            }
        } catch (error) {
            console.warn(`[UniversalDownloader] send failed: ${error.message}`);
            return reply('❌ *Sending failed.* Media link may have expired or requires direct browser access.');
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
