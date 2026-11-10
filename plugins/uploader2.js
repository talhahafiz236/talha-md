'use strict';

const axios  = require('axios');
const FormData = require('form-data');
const { fmt } = require('../lib/theme');
const { dlBuffer } = require('../lib/dlmedia');

async function uploadToCatbox(buf, filename = 'image.jpg', mime = 'image/jpeg') {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', buf, { filename, contentType: mime });
    const res = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: form.getHeaders(),
        timeout: 30000,
    });
    const url = String(res.data || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Catbox returned invalid URL');
    return url;
}

module.exports = {
    commands: ['imgbb', 'pixhost', 'githubcdn'],
    description: 'Upload images to various CDN/hosting services',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { jid, contextInfo } = ctx;
        const cmd  = (message.message?.extendedTextMessage?.text
            || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^\./, '').toLowerCase();
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });

        const msg    = message.message;
        const imgMsg = msg?.imageMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        const docMsg = msg?.documentMessage || msg?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
        const hasMedia = imgMsg || docMsg;

        if (cmd === 'imgbb') {
            if (!hasMedia) return send('❌ Send or reply to an *image* with `.imgbb` to upload it.');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const buf    = await dlBuffer(imgMsg || docMsg, imgMsg ? 'image' : 'document');
                const apiKey = process.env.IMGBB_KEY || '';

                if (apiKey && apiKey !== 'demo') {
                    const form = new FormData();
                    form.append('image', buf.toString('base64'));
                    const res = await axios.post(`https://api.imgbb.com/1/upload?key=${apiKey}`, form, {
                        headers: form.getHeaders(),
                        timeout: 30000,
                    });
                    const url = res.data?.data?.url;
                    if (url) return send(`✅ *Uploaded to ImgBB!*\n\n🔗 ${url}`);
                }

                const url = await uploadToCatbox(buf);
                return send(`✅ *Image Uploaded!*\n\n🔗 ${url}`);
            } catch {
                return send('❌ Upload failed. Try `.catbox` instead.');
            }
        }

        if (cmd === 'pixhost') {
            if (!hasMedia) return send('❌ Send or reply to an *image* with `.pixhost` to upload it.');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const buf  = await dlBuffer(imgMsg || docMsg, imgMsg ? 'image' : 'document');
                try {
                    const form = new FormData();
                    form.append('content_type', '0');
                    form.append('max_th_size', '300');
                    form.append('img', buf, { filename: 'upload.jpg', contentType: 'image/jpeg' });
                    const res = await axios.post('https://api.pixhost.to/images', form, {
                        headers: { ...form.getHeaders(), Accept: 'application/json' },
                        timeout: 30000,
                    });
                    const imgUrl   = res.data?.show_url;
                    const thumbUrl = res.data?.th_url;
                    if (imgUrl) {
                        return send(`✅ *Uploaded to Pixhost!*\n\n🔗 View: ${imgUrl}\n🖼️ Direct: ${thumbUrl || imgUrl}`);
                    }
                } catch {}

                // Reliable Catbox fallback
                const fallbackUrl = await uploadToCatbox(buf);
                return send(`✅ *Uploaded (Catbox Mirror)!*\n\n🔗 ${fallbackUrl}`);
            } catch {
                return send('❌ Image upload failed. Try `.catbox` instead.');
            }
        }

        if (cmd === 'githubcdn') {
            const token = process.env.GITHUB_TOKEN;
            const repo  = process.env.GITHUB_REPO || 'talhahafiz236/talha-md';
            if (!token) return send('⚠️ *GitHub CDN*\n\nSet `GITHUB_TOKEN` and `GITHUB_REPO` env vars to use this feature.\n\nAlternative: Use `.catbox` for free image hosting.');
            if (!hasMedia) return send('❌ Send or reply to an image with `.githubcdn`');
            try {
                await sock.sendPresenceUpdate('composing', jid);
                const buf      = await dlBuffer(imgMsg || docMsg, imgMsg ? 'image' : 'document');
                const filename = `cdn/${Date.now()}.jpg`;
                const content  = buf.toString('base64');
                const res      = await axios.put(
                    `https://api.github.com/repos/${repo}/contents/${filename}`,
                    { message: 'Upload via TALHA MD', content },
                    { headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }, timeout: 30000 }
                );
                const rawUrl = res.data?.content?.download_url;
                return send(`✅ *GitHub CDN Upload!*\n\n🔗 ${rawUrl}`);
            } catch { return send('❌ GitHub CDN upload failed. Check GITHUB_TOKEN and GITHUB_REPO.'); }
        }
    }
};
