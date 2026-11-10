'use strict';

const axios = require('axios');
const { gifToMp4 } = require('../lib/dlmedia');

const UA = 'TALHAMD-Bot/2.0';

// All keys verified on nekos.best/api/v2 (`.kick` owned by kick.js; anime kick uses .animekick / .kickgif)
const REACTIONS = {
    hug:       'hug',
    kiss:      'kiss',
    pat:       'pat',
    slap:      'slap',
    poke:      'poke',
    bite:      'bite',
    bonk:      'bonk',
    cuddle:    'cuddle',
    wave:      'wave',
    blush:     'blush',
    smile:     'smile',
    cry:       'cry',
    laugh:     'laugh',
    dance:     'dance',
    wink:      'wink',
    shoot:     'shoot',
    animekick: 'kick',
    kickgif:   'kick',
    happy:     'happy',
    baka:      'baka',
    nod:       'nod',
};

const REACTION_MESSAGES = {
    hug:       (sender, target) => target ? `🤗 *${sender}* hugs *${target}*!` : `🤗 *${sender}* wants a hug!`,
    kiss:      (sender, target) => target ? `😘 *${sender}* kisses *${target}*!` : `😘 *${sender}* blows a kiss!`,
    pat:       (sender, target) => target ? `😊 *${sender}* pats *${target}*!` : `😊 *${sender}* pats the air!`,
    slap:      (sender, target) => target ? `👋 *${sender}* slaps *${target}*!` : `👋 *${sender}* slaps the air!`,
    poke:      (sender, target) => target ? `👉 *${sender}* pokes *${target}*!` : `👉 *${sender}* pokes around!`,
    bite:      (sender, target) => target ? `😬 *${sender}* bites *${target}*!` : `😬 *${sender}* bites the air!`,
    bonk:      (sender, target) => target ? `🔨 *${sender}* bonks *${target}*! Go to horny jail!` : `🔨 *${sender}* bonks!`,
    cuddle:    (sender, target) => target ? `🥰 *${sender}* cuddles with *${target}*!` : `🥰 *${sender}* wants cuddles!`,
    wave:      (sender, target) => target ? `👋 *${sender}* waves at *${target}*!` : `👋 *${sender}* waves hello!`,
    blush:     (sender)         => `😳 *${sender}* is blushing!`,
    smile:     (sender)         => `😊 *${sender}* smiles!`,
    cry:       (sender)         => `😢 *${sender}* is crying!`,
    laugh:     (sender)         => `😂 *${sender}* is laughing!`,
    dance:     (sender)         => `💃 *${sender}* is dancing!`,
    wink:      (sender, target) => target ? `😉 *${sender}* winks at *${target}*!` : `😉 *${sender}* winks!`,
    shoot:     (sender, target) => target ? `🔫 *${sender}* shoots *${target}*!` : `🔫 *${sender}* shoots!`,
    animekick: (sender, target) => target ? `🦵 *${sender}* kicks *${target}*!` : `🦵 *${sender}* kicks!`,
    kickgif:   (sender, target) => target ? `🦵 *${sender}* kicks *${target}*!` : `🦵 *${sender}* kicks!`,
    happy:     (sender)         => `🎉 *${sender}* is happy!`,
    baka:      (sender, target) => target ? `😤 *${sender}* calls *${target}* a baka!` : `😤 Baka!`,
    nod:       (sender)         => `🙂 *${sender}* nods!`,
};

async function fetchReactionGif(type) {
    try {
        const resp = await axios.get(`https://nekos.best/api/v2/${type}`, {
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });
        const url = resp.data?.results?.[0]?.url;
        if (url) return url;
    } catch {}

    try {
        const resp = await axios.get(`https://api.otakugifs.xyz/gif`, {
            params: { reaction: type },
            headers: { 'User-Agent': UA },
            timeout: 10000,
        });
        if (resp.data?.url) return resp.data.url;
    } catch {}

    return null;
}

module.exports = {
    commands:   Object.keys(REACTIONS),
    description: 'Anime reaction GIFs — hug, kiss, pat, slap, poke, bite, bonk, cuddle, wave, blush, smile, cry, laugh, dance, wink, shoot, animekick, happy, baka, nod',
    usage:      '.hug @user | .kiss @user | .pat | .cry',
    permission: 'public',
    group:      true,
    private:    true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo, sender } = ctx;
        const jid = ctx.jid || message.key.remoteJid;

        const rawCmd = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();

        const type = REACTIONS[rawCmd];
        if (!type) return;

        const senderName = ctx.pushName || message.pushName || sender?.split('@')[0] || 'Someone';

        const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        let targetName = null;
        if (mentionedJid) {
            try {
                const meta = await sock.groupMetadata(jid).catch(() => null);
                const participant = meta?.participants?.find(p => p.id === mentionedJid);
                targetName = participant?.notify || participant?.name || mentionedJid.split('@')[0];
            } catch {
                targetName = mentionedJid.split('@')[0];
            }
        } else if (args.length > 0 && !args[0].startsWith('@')) {
            targetName = args.join(' ');
        }

        const caption = (REACTION_MESSAGES[rawCmd] || ((s, t) => `${s} ${rawCmd}s${t ? ` ${t}` : ''}!`))(senderName, targetName);

        try {
            await sock.sendPresenceUpdate('composing', jid);
            const gifUrl = await fetchReactionGif(type);

            if (gifUrl) {
                const imgResp = await axios.get(gifUrl, {
                    responseType: 'arraybuffer',
                    headers: { 'User-Agent': UA },
                    timeout: 15000,
                });
                const rawBuf = Buffer.from(imgResp.data || []);
                if (rawBuf.length > 1024) {
                    try {
                        const mp4Buf = await gifToMp4(rawBuf);
                        return await sock.sendMessage(jid, {
                            video: mp4Buf,
                            mimetype: 'video/mp4',
                            gifPlayback: true,
                            caption,
                            contextInfo,
                        }, { quoted: message });
                    } catch {
                        // Fallback if ffmpeg not present: send caption cleanly or image
                        return await sock.sendMessage(jid, { text: caption, contextInfo }, { quoted: message });
                    }
                }
            }
            await sock.sendMessage(jid, { text: caption, contextInfo }, { quoted: message });
        } catch {
            await sock.sendMessage(jid, { text: caption, contextInfo }, { quoted: message });
        }
    }
};
