'use strict';

/**
 * Shared media-download & transcoding helpers for TALHA MD plugins.
 * Uses downloadContentFromMessage (the correct Baileys API).
 */

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TYPE_MAP = {
    imageMessage:     'image',
    videoMessage:     'video',
    audioMessage:     'audio',
    documentMessage:  'document',
    stickerMessage:   'sticker',
    ptvMessage:       'video',
};

/**
 * Download a media message into a Buffer.
 * @param {object} msgContent  The specific typed sub-message (e.g. msg.imageMessage)
 * @param {string} mediaType   Baileys media type string ('image', 'video', 'audio', 'sticker', 'document')
 * @returns {Promise<Buffer>}
 */
async function dlBuffer(msgContent, mediaType) {
    const stream = await downloadContentFromMessage(msgContent, mediaType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('Downloaded media buffer is empty');
    return buf;
}

/**
 * Auto-detect the media type from a message object and download it.
 * Searches the message top-level first, then inside quoted context.
 * @param {object} msgObj  message.message  (the inner message)
 * @returns {Promise<{ buffer: Buffer, mediaType: string, msgContent: object }>}
 */
async function dlAuto(msgObj) {
    for (const [key, type] of Object.entries(TYPE_MAP)) {
        if (msgObj?.[key]) {
            return { buffer: await dlBuffer(msgObj[key], type), mediaType: type, msgContent: msgObj[key] };
        }
    }
    const quoted = msgObj?.extendedTextMessage?.contextInfo?.quotedMessage;
    for (const [key, type] of Object.entries(TYPE_MAP)) {
        if (quoted?.[key]) {
            return { buffer: await dlBuffer(quoted[key], type), mediaType: type, msgContent: quoted[key] };
        }
    }
    throw new Error('No downloadable media found in this message');
}

/**
 * Convert an animated GIF buffer to H.264 MP4 for reliable WhatsApp gifPlayback delivery.
 * @param {Buffer} gifBuffer
 * @returns {Promise<Buffer>}
 */
function gifToMp4(gifBuffer) {
    return new Promise((resolve, reject) => {
        const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const inPath = path.join(os.tmpdir(), `talha_gif_${uid}.gif`);
        const outPath = path.join(os.tmpdir(), `talha_gif_${uid}.mp4`);
        try {
            fs.writeFileSync(inPath, gifBuffer);
        } catch (e) {
            return reject(e);
        }
        execFile(
            'ffmpeg',
            [
                '-y', '-i', inPath,
                '-movflags', 'faststart',
                '-pix_fmt', 'yuv420p',
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                '-an', '-c:v', 'libx264', '-preset', 'veryfast',
                outPath,
            ],
            { timeout: 30000 },
            (err) => {
                try {
                    if (err || !fs.existsSync(outPath)) {
                        return reject(err || new Error('ffmpeg gif->mp4 failed'));
                    }
                    const mp4Buf = fs.readFileSync(outPath);
                    if (mp4Buf.length < 1024) return reject(new Error('MP4 output too small'));
                    resolve(mp4Buf);
                } finally {
                    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
                    try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
                }
            }
        );
    });
}

module.exports = { dlBuffer, dlAuto, gifToMp4, TYPE_MAP };
