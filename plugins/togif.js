'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { dlBuffer } = require('../lib/dlmedia');
const { withMediaSlot, getMaxMediaBytes } = require('../lib/memory-guard');

function stickerToMp4(buffer) {
    return new Promise((resolve, reject) => {
        const id = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const input = path.join(os.tmpdir(), `talha_sticker_${id}.webp`);
        const output = path.join(os.tmpdir(), `talha_sticker_${id}.mp4`);
        try { fs.writeFileSync(input, buffer); } catch (error) { return reject(error); }
        execFile('ffmpeg', [
            '-y', '-i', input, '-an', '-threads', '1', '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p', '-movflags', 'faststart',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', output,
        ], { timeout: 30000 }, (error) => {
            try {
                if (error || !fs.existsSync(output)) return reject(error || new Error('ffmpeg WebP-to-MP4 conversion failed'));
                const mp4 = fs.readFileSync(output);
                if (mp4.length < 1024) return reject(new Error('MP4 output is too small'));
                resolve(mp4);
            } finally {
                for (const file of [input, output]) {
                    try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
                }
            }
        });
    });
}

module.exports = {
    commands:    ['togif', 'gif', 'mp4togif'],
    description: 'Convert sticker or video to GIF',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const chatId = jid || sender;
        const ctx     = message.message?.extendedTextMessage?.contextInfo;
        const quoted  = ctx?.quotedMessage;
        const stickerMsg = quoted?.stickerMessage || message.message?.stickerMessage;
        const videoMsg   = quoted?.videoMessage   || message.message?.videoMessage;
        const target     = stickerMsg || videoMsg;
        const typeHint   = stickerMsg ? 'sticker' : 'video';
        if (!target) {
            return sock.sendMessage(chatId, {
                text: '🎞️ Reply to a sticker or video with .togif to convert it to GIF.',
                contextInfo
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Converting to GIF...', contextInfo }, { quoted: message });
        try {
            const videoBuffer = await withMediaSlot(async () => {
                const buffer = await dlBuffer(target, typeHint, { maxBytes: getMaxMediaBytes() });
                return stickerMsg ? stickerToMp4(buffer) : buffer;
            });
            await sock.sendMessage(chatId, {
                video:     videoBuffer,
                gifPlayback: true,
                mimetype:  'video/mp4',
                contextInfo
            }, { quoted: message });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ GIF conversion failed: ${e.message}`, contextInfo }, { quoted: message });
        }
    }
};
