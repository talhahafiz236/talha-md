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

function summarizeDownloadError(err) {
    const text = `${err?.stderr || ''} ${err?.message || ''}`.toLowerCase();
    if (/timed?\s*out|timeout|etimedout/.test(text)) return 'timeout';
    if (/429|rate.?limit|too many requests/.test(text)) return 'rate limited';
    if (/403|forbidden|blocked/.test(text)) return 'provider blocked the request';
    if (/sign in|po.?token|challenge|javascript|nsig|signature/.test(text)) return 'YouTube anti-bot challenge';
    if (/enoent|not found.*(yt-dlp|ffmpeg)/.test(text)) return 'required executable missing';
    if (err?.response?.status) return `HTTP ${err.response.status}`;
    if (/econnreset|econnrefused|enotfound|network/.test(text)) return 'network error';
    return err?.code ? `process error (${String(err.code).slice(0, 24)})` : 'no playable stream returned';
}

function recordDownloadFailure(failures, stage, err) {
    failures.push(`${stage}: ${summarizeDownloadError(err)}`);
}

function isLikelyHtmlBuffer(buf) {
    if (!buf || !buf.length) return true;
    const head = buf.slice(0, 256).toString('utf8').trim().toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<head');
}

function getYtCookiesFile() {
    const cookieTxt = (process.env.YT_COOKIES || '').trim();
    if (cookieTxt) {
        try {
            const p = path.join(os.tmpdir(), 'talha_yt_cookies.txt');
            if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== cookieTxt) {
                fs.writeFileSync(p, cookieTxt, 'utf8');
            }
            return p;
        } catch {}
    }
    const localCookie = path.join(__dirname, '..', 'data', 'yt_cookies.txt');
    if (fs.existsSync(localCookie)) return localCookie;
    return null;
}

const INNERTUBE_CLIENTS = [
    {
        name: 'ANDROID_VR',
        ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; en_US; Quest 3; Build/SQ3A.220605.009.A1)',
        context: {
            client: {
                clientName: 'ANDROID_VR',
                clientVersion: '1.60.19',
                androidSdkVersion: 32,
                osName: 'Android',
                osVersion: '12L',
                hl: 'en',
                gl: 'US',
            },
        },
    },
    {
        name: 'IOS',
        ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X)',
        context: {
            client: {
                clientName: 'IOS',
                clientVersion: '20.10.4',
                deviceMake: 'Apple',
                deviceModel: 'iPhone16,2',
                osName: 'iPhone',
                osVersion: '18.3.2.22D82',
                hl: 'en',
                gl: 'US',
            },
        },
    },
];

async function fetchInnerTubePlayer(videoUrl) {
    const vid = extractVideoId(videoUrl);
    if (!vid) throw new Error('Invalid YouTube video ID');

    let lastErr = null;
    for (const clientCfg of INNERTUBE_CLIENTS) {
        try {
            const res = await axios.post(
                'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
                {
                    videoId: vid,
                    context: clientCfg.context,
                    contentCheckOk: true,
                    racyCheckOk: true,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': clientCfg.ua,
                    },
                    timeout: 12000,
                }
            );
            const data = res.data;
            const status = data?.playabilityStatus?.status;
            const formats = (data?.streamingData?.formats || []).filter(f => f?.url);
            const adaptive = (data?.streamingData?.adaptiveFormats || []).filter(f => f?.url);
            if (status === 'OK' && (formats.length || adaptive.length)) {
                return {
                    ua: clientCfg.ua,
                    title: data?.videoDetails?.title || '',
                    author: data?.videoDetails?.author || '',
                    formats,
                    adaptive,
                };
            }
            lastErr = new Error(data?.playabilityStatus?.reason || `InnerTube ${clientCfg.name} status=${status}`);
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('InnerTube failed');
}

async function fetchValidMediaBuffer(url, maxBytes = 50 * 1024 * 1024, customUa = UA) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 45000,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        headers: { 'User-Agent': customUa, Accept: '*/*' },
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
    const failures = [];

    // Strategy 1: yt-dlp with EJS support and clients that expose HLS audio
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempPrefix = path.join(os.tmpdir(), `talha_audio_${uid}`);
    const finalMp3Path = `${tempPrefix}.mp3`;
    const cookieFile = getYtCookiesFile();
    const cookieArgs = cookieFile ? ['--cookies', cookieFile] : [];

    const ytDlpAttempts = [
        [
            ...cookieArgs,
            '-f', 'bestaudio/best',
            '-x', '--audio-format', 'mp3', '--no-playlist', '--no-warnings',
            '--js-runtimes', 'node',
            '--remote-components', 'ejs:github',
            '--extractor-args', 'youtube:player_client=mweb,tv,web_safari',
            '--max-filesize', '35M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
        [
            ...cookieArgs,
            '-f', 'bestaudio/best',
            '-x', '--audio-format', 'mp3', '--no-playlist', '--no-warnings',
            '--max-filesize', '35M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
    ];

    for (const [attemptIndex, args] of ytDlpAttempts.entries()) {
        try {
            await runExecFile('yt-dlp', args, attemptIndex === 0 ? 120000 : 60000);
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
                recordDownloadFailure(failures, 'yt-dlp', e);
                console.warn(`[YouTubeDL] yt-dlp audio attempt notice: ${summarizeDownloadError(e)}`);
            }
            if (/ENOENT/i.test(e.message || '')) break;
        } finally {
            cleanupPrefixFiles(tempPrefix);
        }
    }

    // Strategy 2: Direct YouTube InnerTube (ANDROID_VR / IOS) — zero third-party dependency
    try {
        const player = await fetchInnerTubePlayer(videoUrl);
        const audioCands = player.adaptive
            .filter(f => /^audio\//i.test(f.mimeType || ''))
            .sort((a, b) => {
                const aMp4 = /audio\/mp4/i.test(a.mimeType || '') ? 1 : 0;
                const bMp4 = /audio\/mp4/i.test(b.mimeType || '') ? 1 : 0;
                if (aMp4 !== bMp4) return bMp4 - aMp4;
                return (b.bitrate || 0) - (a.bitrate || 0);
            });
        const chosenAudio = audioCands[0]
            || player.formats.find(f => /mp4/i.test(f.mimeType || ''));
        if (chosenAudio?.url) {
            const media = await fetchValidMediaBuffer(chosenAudio.url, 35 * 1024 * 1024, player.ua);
            const isWebm = /webm/i.test(chosenAudio.mimeType || media.contentType);
            const isVideoContainer = /^video\//i.test(chosenAudio.mimeType || media.contentType);
            const ext = isWebm ? 'webm' : 'm4a';
            try {
                const mp3Buf = await transcodeBufferToMp3(media.buffer, ext);
                return { buffer: mp3Buf, type: 'buffer', mimetype: 'audio/mpeg', title: player.title };
            } catch {
                if (!isWebm && !isVideoContainer) {
                    return { buffer: media.buffer, type: 'buffer', mimetype: 'audio/mp4', title: player.title };
                }
            }
        }
    } catch (e) {
        recordDownloadFailure(failures, 'YouTube direct', e);
        console.warn(`[YouTubeDL] InnerTube audio notice: ${summarizeDownloadError(e)}`);
    }

    // Strategy 3: rahad-all-downloader-v2
    try {
        const { alldl } = require('rahad-all-downloader-v2');
        const r = await Promise.race([
            alldl(videoUrl),
            new Promise((_, rej) => setTimeout(() => rej(new Error('alldl timeout')), 15000)),
        ]);
        const dlUrl = r?.data?.download?.audio || r?.data?.download?.video || r?.data?.videoUrl || r?.data?.url;
        if (dlUrl && /^https?:\/\//i.test(dlUrl)) {
            const media = await fetchValidMediaBuffer(dlUrl, 35 * 1024 * 1024);
            try {
                const mp3Buf = await transcodeBufferToMp3(media.buffer, 'mp4');
                return { buffer: mp3Buf, type: 'buffer', mimetype: 'audio/mpeg', title: r?.data?.title || '' };
            } catch {
                if (r?.data?.download?.audio) {
                    return { buffer: media.buffer, type: 'buffer', mimetype: 'audio/mpeg', title: r?.data?.title || '' };
                }
            }
        }
    } catch (e) {
        recordDownloadFailure(failures, 'alternate provider A', e);
        console.warn(`[YouTubeDL] AllDL audio notice: ${summarizeDownloadError(e)}`);
    }

    // Strategy 4: DavidCyrilTech MP4 endpoint -> ffmpeg MP3 transcode
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
        recordDownloadFailure(failures, 'alternate provider B', e);
        console.warn(`[YouTubeDL] DavidCyril MP4->MP3 fallback notice: ${summarizeDownloadError(e)}`);
    }

    throw new Error(`Could not download audio stream. ${failures.length ? `Checks: ${failures.join('; ')}. ` : ''}Please try another song title.`);
}

async function downloadVideo(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required');
    const failures = [];

    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempPrefix = path.join(os.tmpdir(), `talha_vid_${uid}`);
    const finalMp4Path = `${tempPrefix}.mp4`;
    const cookieFile = getYtCookiesFile();
    const cookieArgs = cookieFile ? ['--cookies', cookieFile] : [];

    const ytDlpAttempts = [
        [
            ...cookieArgs,
            '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[ext=mp4]/best',
            '--merge-output-format', 'mp4', '--no-playlist', '--no-warnings',
            '--js-runtimes', 'node',
            '--remote-components', 'ejs:github',
            '--extractor-args', 'youtube:player_client=mweb,tv,web_safari',
            '--max-filesize', '50M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
        [
            ...cookieArgs,
            '-f', 'b[height<=720][ext=mp4]/b[ext=mp4]/best',
            '--no-playlist', '--no-warnings',
            '--js-runtimes', 'node',
            '--remote-components', 'ejs:github',
            '--max-filesize', '50M',
            '-o', `${tempPrefix}.%(ext)s`,
            videoUrl,
        ],
    ];

    for (const [attemptIndex, args] of ytDlpAttempts.entries()) {
        try {
            await runExecFile('yt-dlp', args, attemptIndex === 0 ? 120000 : 60000);
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
                recordDownloadFailure(failures, 'yt-dlp', e);
                console.warn(`[YouTubeDL] yt-dlp video attempt notice: ${summarizeDownloadError(e)}`);
            }
            if (/ENOENT/i.test(e.message || '')) break;
        } finally {
            cleanupPrefixFiles(tempPrefix);
        }
    }

    // Strategy 2: Direct YouTube InnerTube progressive MP4 (ANDROID_VR / IOS)
    try {
        const player = await fetchInnerTubePlayer(videoUrl);
        const progCands = player.formats
            .filter(f => /video\/mp4/i.test(f.mimeType || ''))
            .sort((a, b) => (b.height || 0) - (a.height || 0));
        const chosenVid = progCands.find(f => (f.height || 0) <= 720) || progCands[0];
        if (chosenVid?.url) {
            const media = await fetchValidMediaBuffer(chosenVid.url, 50 * 1024 * 1024, player.ua);
            return { buffer: media.buffer, type: 'buffer', mimetype: 'video/mp4', title: player.title };
        }
    } catch (e) {
        recordDownloadFailure(failures, 'YouTube direct', e);
        console.warn(`[YouTubeDL] InnerTube video notice: ${summarizeDownloadError(e)}`);
    }

    // Strategy 3: rahad-all-downloader-v2
    try {
        const { alldl } = require('rahad-all-downloader-v2');
        const r = await Promise.race([
            alldl(videoUrl),
            new Promise((_, rej) => setTimeout(() => rej(new Error('alldl timeout')), 15000)),
        ]);
        const dlUrl = r?.data?.download?.video || r?.data?.videoUrl || r?.data?.url;
        if (dlUrl && /^https?:\/\//i.test(dlUrl)) {
            const media = await fetchValidMediaBuffer(dlUrl, 50 * 1024 * 1024);
            return { buffer: media.buffer, type: 'buffer', mimetype: 'video/mp4', title: r?.data?.title || '' };
        }
    } catch (e) {
        recordDownloadFailure(failures, 'alternate provider A', e);
        console.warn(`[YouTubeDL] AllDL video notice: ${summarizeDownloadError(e)}`);
    }

    // Strategy 4: DavidCyrilTech ytmp4 endpoint
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
        recordDownloadFailure(failures, 'alternate provider B', e);
        console.warn(`[YouTubeDL] DavidCyril ytmp4 fallback notice: ${summarizeDownloadError(e)}`);
    }

    throw new Error(`Could not download video stream. ${failures.length ? `Checks: ${failures.join('; ')}. ` : ''}Please try another query.`);
}

module.exports = {
    searchYouTube,
    downloadAudio,
    downloadVideo,
    fetchDavidCyrilMp4,
    transcodeBufferToMp3,
    fetchValidMediaBuffer,
};
