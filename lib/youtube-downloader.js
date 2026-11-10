'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const yts = require('yt-search');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function runExecFile(bin, args, timeout = 60000) {
    return new Promise((resolve, reject) => {
        execFile(bin, args, { timeout, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) => {
            if (err) {
                err.stdout = stdout;
                err.stderr = stderr;
                return reject(err);
            }
            resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
}

function isLikelyHtmlBuffer(buf) {
    if (!buf || !buf.length) return true;
    const head = buf.slice(0, 256).toString('utf8').trim().toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head');
}

async function fetchValidMediaBuffer(url, maxBytes = 50 * 1024 * 1024) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 45000,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        headers: { 'User-Agent': UA, Accept: '*/*' },
        validateStatus: s => s >= 200 && s < 400,
    });
    const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
    if (ctype.includes('text/html') || ctype.includes('application/json')) {
        throw new Error(`Invalid media content-type: ${ctype}`);
    }
    const buf = Buffer.from(res.data);
    if (buf.length < 4096 || isLikelyHtmlBuffer(buf)) {
        throw new Error('Downloaded payload is empty or HTML');
    }
    return { buffer: buf, contentType: ctype };
}

function extractVideoId(url) {
    const m = String(url || '').match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
}

async function searchYouTube(query) {
    if (!query) throw new Error('Search query is required');

    const isUrl = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(query);
    if (isUrl) {
        const vid = extractVideoId(query);
        try {
            const r = await yts(vid ? { videoId: vid } : query);
            const v = r?.title ? r : r?.videos?.[0];
            if (v?.url || v?.videoId) {
                const vId = v.videoId || vid;
                return {
                    title: v.title || 'YouTube Media',
                    url: v.url || `https://www.youtube.com/watch?v=${vId}`,
                    duration: v.timestamp || '',
                    author: v.author?.name || 'YouTube',
                    thumbnail: v.thumbnail || (vId ? `https://img.youtube.com/vi/${vId}/hqdefault.jpg` : ''),
                    videoId: vId,
                };
            }
        } catch {}

        return {
            title: 'YouTube Media',
            url: query,
            duration: '',
            author: 'YouTube',
            thumbnail: vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '',
            videoId: vid,
        };
    }

    try {
        const searchResult = await yts(query);
        const videos = searchResult?.videos || [];
        if (videos.length) {
            const v = videos[0];
            return {
                title: v.title,
                url: v.url,
                duration: v.timestamp || '',
                author: v.author?.name || 'YouTube',
                thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
                videoId: v.videoId,
            };
        }
    } catch {}

    // Fallback: play-dl search
    try {
        const playdl = require('play-dl');
        const list = await playdl.search(query, { source: { youtube: 'video' }, limit: 1 });
        if (list?.length) {
            const v = list[0];
            const vid = v.id || extractVideoId(v.url);
            return {
                title: v.title || query,
                url: v.url || `https://www.youtube.com/watch?v=${vid}`,
                duration: v.durationRaw || '',
                author: v.channel?.name || 'YouTube',
                thumbnail: v.thumbnails?.[0]?.url || (vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : ''),
                videoId: vid,
            };
        }
    } catch {}

    // Fallback: yt-dlp search (Docker / Render)
    try {
        const { stdout } = await runExecFile('yt-dlp', [
            `ytsearch1:${query}`,
            '--no-warnings',
            '--print',
            '%(title)s:::%(webpage_url)s:::%(duration_string)s:::%(uploader)s:::%(id)s',
        ], 25000);
        const parts = stdout.trim().split(':::');
        if (parts[1] || parts[4]) {
            return {
                title: parts[0] || query,
                url: parts[1] || `https://www.youtube.com/watch?v=${parts[4]}`,
                duration: parts[2] || '',
                author: parts[3] || 'YouTube',
                thumbnail: parts[4] ? `https://img.youtube.com/vi/${parts[4]}/hqdefault.jpg` : '',
                videoId: parts[4] || '',
            };
        }
    } catch {}

    throw new Error(`No YouTube results found matching: "${query}"`);
}

function cleanupPrefixFiles(prefix) {
    try {
        const dir = path.dirname(prefix);
        const base = path.basename(prefix);
        for (const f of fs.readdirSync(dir)) {
            if (f.startsWith(base)) {
                try { fs.unlinkSync(path.join(dir, f)); } catch {}
            }
        }
    } catch {}
}

async function fetchDavidCyrilMp4(videoUrl) {
    const res = await axios.get('https://apis.davidcyriltech.my.id/download/ytmp4', {
        params: { url: videoUrl },
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        timeout: 25000,
    });
    const d = res.data;
    const dlUrl = d?.result?.download_url || d?.result?.url || d?.download_url || d?.url;
    if (!dlUrl || !/^https?:\/\//i.test(dlUrl)) {
        throw new Error('davidcyriltech ytmp4 returned no URL');
    }
    const media = await fetchValidMediaBuffer(dlUrl);
    return {
        buffer: media.buffer,
        title: d?.result?.title || '',
        thumbnail: d?.result?.thumbnail || '',
        mimetype: 'video/mp4',
    };
}

async function transcodeBufferToMp3(inputBuffer, ext = 'mp4') {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inPath = path.join(os.tmpdir(), `talha_in_${uid}.${ext}`);
    const outPath = path.join(os.tmpdir(), `talha_out_${uid}.mp3`);
    try {
        fs.writeFileSync(inPath, inputBuffer);
        await runExecFile('ffmpeg', [
            '-y', '-i', inPath,
            '-vn', '-acodec', 'libmp3lame', '-b:a', '128k',
            outPath,
        ], 45000);
        if (!fs.existsSync(outPath)) throw new Error('ffmpeg produced no MP3 output');
        const mp3Buf = fs.readFileSync(outPath);
        if (mp3Buf.length < 2048) throw new Error('MP3 output too small');
        return mp3Buf;
    } finally {
        try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch {}
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
    }
}

async function downloadAudio(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required');

    // Strategy 1: yt-dlp on Linux/Render Docker (with android/ios/tv_embedded clients + Node JS runtime)
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempPrefix = path.join(os.tmpdir(), `talha_audio_${uid}`);
    const finalMp3Path = `${tempPrefix}.mp3`;

    const ytDlpAttempts = [
        [
            '-x', '--audio-format', 'mp3', '--no-playlist', '--no-warnings',
            '--js-runtimes', 'node',
            '--extractor-args', 'youtube:player_client=android,ios,tv_embedded',
            '--max-filesize', '35M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
        [
            '-x', '--audio-format', 'mp3', '--no-playlist', '--no-warnings',
            '--max-filesize', '35M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
    ];

    for (const args of ytDlpAttempts) {
        try {
            await runExecFile('yt-dlp', args, 55000);
            if (fs.existsSync(finalMp3Path) && fs.statSync(finalMp3Path).size > 2048) {
                const buffer = fs.readFileSync(finalMp3Path);
                return { buffer, type: 'buffer', mimetype: 'audio/mpeg' };
            }
            const dir = path.dirname(tempPrefix);
            const base = path.basename(tempPrefix);
            const found = fs.readdirSync(dir).find(f => f.startsWith(base));
            if (found) {
                const rawPath = path.join(dir, found);
                const rawBuf = fs.readFileSync(rawPath);
                if (rawBuf.length > 2048) {
                    const ext = path.extname(found).replace(/^\./, '') || 'm4a';
                    try {
                        const mp3Buf = await transcodeBufferToMp3(rawBuf, ext);
                        return { buffer: mp3Buf, type: 'buffer', mimetype: 'audio/mpeg' };
                    } catch {
                        return { buffer: rawBuf, type: 'buffer', mimetype: 'audio/mp4' };
                    }
                }
            }
        } catch (e) {
            if (!/ENOENT/i.test(e.message || '')) {
                console.warn(`[YouTubeDL] yt-dlp audio attempt notice: ${e.message}`);
            }
            if (/ENOENT/i.test(e.message || '')) break;
        } finally {
            cleanupPrefixFiles(tempPrefix);
        }
    }

    // Strategy 2: Verified DavidCyrilTech MP4 endpoint -> ffmpeg MP3 transcode
    try {
        const mp4 = await fetchDavidCyrilMp4(videoUrl);
        const mp3Buf = await transcodeBufferToMp3(mp4.buffer, 'mp4');
        return {
            buffer: mp3Buf,
            type: 'buffer',
            mimetype: 'audio/mpeg',
            title: mp4.title,
            thumbnail: mp4.thumbnail,
        };
    } catch (e) {
        console.warn(`[YouTubeDL] DavidCyril MP4->MP3 fallback notice: ${e.message}`);
    }

    throw new Error('Could not download audio stream. Please check the link or try another song title.');
}

async function downloadVideo(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required');

    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempPrefix = path.join(os.tmpdir(), `talha_vid_${uid}`);
    const finalMp4Path = `${tempPrefix}.mp4`;

    const ytDlpAttempts = [
        [
            '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-playlist', '--no-warnings',
            '--js-runtimes', 'node',
            '--extractor-args', 'youtube:player_client=android,ios,tv_embedded',
            '--max-filesize', '50M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
        [
            '-f', 'b[height<=720][ext=mp4]/b[ext=mp4]/best',
            '--no-playlist', '--no-warnings',
            '--max-filesize', '50M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
    ];

    for (const args of ytDlpAttempts) {
        try {
            await runExecFile('yt-dlp', args, 60000);
            if (fs.existsSync(finalMp4Path) && fs.statSync(finalMp4Path).size > 4096) {
                const buffer = fs.readFileSync(finalMp4Path);
                return { buffer, type: 'buffer', mimetype: 'video/mp4' };
            }
            const dir = path.dirname(tempPrefix);
            const base = path.basename(tempPrefix);
            const found = fs.readdirSync(dir).find(f => f.startsWith(base));
            if (found) {
                const buf = fs.readFileSync(path.join(dir, found));
                if (buf.length > 4096) {
                    return { buffer: buf, type: 'buffer', mimetype: 'video/mp4' };
                }
            }
        } catch (e) {
            if (!/ENOENT/i.test(e.message || '')) {
                console.warn(`[YouTubeDL] yt-dlp video attempt notice: ${e.message}`);
            }
            if (/ENOENT/i.test(e.message || '')) break;
        } finally {
            cleanupPrefixFiles(tempPrefix);
        }
    }

    // Strategy 2: Verified DavidCyrilTech ytmp4 endpoint (downloads & validates real MP4 bytes)
    try {
        const mp4 = await fetchDavidCyrilMp4(videoUrl);
        return {
            buffer: mp4.buffer,
            type: 'buffer',
            mimetype: 'video/mp4',
            title: mp4.title,
            thumbnail: mp4.thumbnail,
        };
    } catch (e) {
        console.warn(`[YouTubeDL] DavidCyril ytmp4 fallback notice: ${e.message}`);
    }

    throw new Error('Could not download video stream. Please try a shorter video or another query.');
}

module.exports = {
    searchYouTube,
    downloadAudio,
    downloadVideo,
    fetchDavidCyrilMp4,
    transcodeBufferToMp3,
    fetchValidMediaBuffer,
};
