'use strict';

const axios = require('axios');
const qs = require('querystring');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_VIDEO_BYTES = 55 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function isHtmlBuffer(buf) {
    try {
        if (!buf || !buf.length) return true;
        const head = buf.subarray(0, 192).toString('utf8').trim().toLowerCase();
        return head.startsWith('<!doctype')
            || head.startsWith('<html')
            || head.startsWith('<head')
            || head.startsWith('<?xml');
    } catch {
        return true;
    }
}

function fixTikWmUrl(u) {
    if (!u || typeof u !== 'string') return null;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return `https:${u}`;
    return u.startsWith('/') ? `https://www.tikwm.com${u}` : `https://www.tikwm.com/${u}`;
}

function cleanEscapedUrl(u) {
    if (!u || typeof u !== 'string') return null;
    return u.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
}

function dedupeUrls(urls) {
    const out = [];
    const seen = new Set();
    for (const u of urls) {
        if (!u || typeof u !== 'string') continue;
        const clean = u.trim();
        if (!clean || !/^https?:\/\//i.test(clean) || seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
    }
    return out;
}

async function resolveCanonicalTikTokUrl(rawUrl) {
    const clean = String(rawUrl || '').trim();
    if (!/(?:vt\.tiktok\.com|vm\.tiktok\.com|tiktok\.com\/t\/)/i.test(clean)) {
        return clean;
    }
    try {
        const res = await axios.get(clean, {
            maxRedirects: 8,
            timeout: 10000,
            signal: AbortSignal.timeout(12000),
            headers: {
                'User-Agent': UA_DESKTOP,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            validateStatus: s => s >= 200 && s < 400,
        });
        const finalUrl = res.request?.res?.responseUrl || res.request?.responseURL;
        if (finalUrl && /tiktok\.com/i.test(finalUrl)) {
            return finalUrl.split('?')[0];
        }
    } catch (_) {}
    return clean;
}

async function fetchMediaBuffer(mediaUrl, extraHeaders = {}, kind = 'video') {
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
        throw new Error('Invalid media URL');
    }

    const minSize = kind === 'image' ? 1024 : 4096;
    const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

    const headerVariants = [extraHeaders];
    if (!extraHeaders.Cookie) {
        if (!extraHeaders.Referer) {
            headerVariants.push({ ...extraHeaders, Referer: 'https://www.tiktok.com/', Origin: 'https://www.tiktok.com' });
        } else {
            const { Referer: _r, Origin: _o, ...withoutRef } = extraHeaders;
            headerVariants.push(withoutRef);
        }
    }

    let lastErr = null;
    for (const h of headerVariants) {
        try {
            const res = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 24000,
                signal: AbortSignal.timeout(26000),
                maxRedirects: 6,
                maxContentLength: maxBytes,
                maxBodyLength: maxBytes,
                headers: {
                    'User-Agent': UA_DESKTOP,
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    ...h,
                },
            });

            if (res.status < 200 || res.status >= 300) {
                throw new Error(`HTTP ${res.status}`);
            }

            const ctype = String(res.headers?.['content-type'] || '').toLowerCase();
            if (ctype.includes('text/html') || ctype.includes('application/json') || ctype.includes('text/plain')) {
                throw new Error(`Unexpected content-type: ${ctype}`);
            }

            const buf = Buffer.from(res.data);
            if (buf.length < minSize || isHtmlBuffer(buf)) {
                throw new Error(`Invalid/empty media payload (${buf.length} bytes)`);
            }
            return buf;
        } catch (err) {
            lastErr = err;
            const status = err?.response?.status;
            // Retry header variant on 403/401; otherwise fail fast for this URL
            if (status !== 403 && status !== 401) break;
        }
    }

    throw lastErr || new Error('Media download failed');
}

async function resolveVerifiedCandidate(meta) {
    // Photo / slideshow post
    if (Array.isArray(meta.images) && meta.images.length) {
        const imageBuffers = [];
        for (const imgUrl of meta.images.slice(0, 8)) {
            try {
                const buf = await fetchMediaBuffer(imgUrl, meta.imageHeaders || meta.headers || {}, 'image');
                imageBuffers.push(buf);
            } catch (e) {
                console.warn(`[TikTok] ${meta.source} image skipped (${e.message})`);
            }
        }
        if (imageBuffers.length) {
            return {
                images: imageBuffers,
                audioUrl: meta.audioUrl || null,
                audioHeaders: meta.headers || {},
                author: meta.author || 'TikTok User',
                likes: meta.likes ?? 'N/A',
                title: meta.title || 'TikTok Photo',
                source: meta.source,
            };
        }
    }

    // Video candidates
    const urls = dedupeUrls(meta.videoUrls || []);
    let lastErr = null;
    for (const candidateUrl of urls) {
        try {
            const buffer = await fetchMediaBuffer(candidateUrl, meta.headers || {}, 'video');
            return {
                buffer,
                videoUrl: candidateUrl,
                audioUrl: meta.audioUrl || null,
                audioHeaders: meta.headers || {},
                author: meta.author || 'TikTok User',
                likes: meta.likes ?? 'N/A',
                title: meta.title || 'TikTok Video',
                source: meta.source,
            };
        } catch (e) {
            lastErr = e;
            console.warn(`[TikTok] ${meta.source} candidate blocked/failed (${e.response?.status || ''} ${e.message})`);
        }
    }
    throw lastErr || new Error(`${meta.source}: no downloadable media candidate`);
}

// ─── Strategy 1: www.tikwm.com (GET & POST hd=1) ─────────────────────────────
async function tryTikWm(url) {
    const endpoints = [
        {
            name: 'TikWM-GET',
            req: () => axios.get('https://www.tikwm.com/api/', {
                params: { url, hd: 1 },
                headers: { 'User-Agent': UA_DESKTOP, 'Referer': 'https://www.tikwm.com/' },
                timeout: 15000,
                signal: AbortSignal.timeout(17000),
            }),
        },
        {
            name: 'TikWM-POST',
            req: () => axios.post('https://www.tikwm.com/api/', qs.stringify({ url, hd: 1 }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': UA_DESKTOP,
                    'Referer': 'https://www.tikwm.com/',
                    'Origin': 'https://www.tikwm.com',
                },
                timeout: 15000,
                signal: AbortSignal.timeout(17000),
            }),
        },
    ];

    let lastErr = null;
    for (const ep of endpoints) {
        try {
            const res = await ep.req();
            const d = res.data?.data;
            if (res.data?.code !== 0 || !d) {
                throw new Error(res.data?.msg || 'empty response');
            }
            const videoUrls = [
                fixTikWmUrl(d.hdplay),
                fixTikWmUrl(d.play),
                fixTikWmUrl(d.wmplay),
            ].filter(Boolean);
            const images = Array.isArray(d.images) ? d.images.map(fixTikWmUrl).filter(Boolean) : [];
            if (!videoUrls.length && !images.length) {
                throw new Error('no video or image urls');
            }
            return await resolveVerifiedCandidate({
                videoUrls,
                images,
                headers: { Referer: 'https://www.tikwm.com/' },
                audioUrl: fixTikWmUrl(d.music),
                author: d.author?.nickname || d.author?.unique_id || 'TikTok User',
                likes: d.digg_count ?? 0,
                title: d.title || 'TikTok Video',
                source: ep.name,
            });
        } catch (e) {
            lastErr = e;
            console.warn(`[TikTok] ${ep.name} error: ${e.message}`);
        }
    }
    throw lastErr || new Error('TikWM failed');
}

// ─── Strategy 2: ssstik.io (returns tikcdn.io/ssstik CDN — verified cloud-safe) ─
async function trySssTik(url) {
    const home = await axios.get('https://ssstik.io/', {
        headers: { 'User-Agent': UA_DESKTOP },
        timeout: 12000,
        signal: AbortSignal.timeout(14000),
    });
    const tt = String(home.data || '').match(/tt\s*=\s*['"]([^'"]+)['"]/)?.[1];
    if (!tt) throw new Error('ssstik token missing');

    const dlRes = await axios.post(
        'https://ssstik.io/abc?url=dl',
        qs.stringify({ id: url, locale: 'en', tt }),
        {
            headers: {
                'User-Agent': UA_DESKTOP,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://ssstik.io',
                'Referer': 'https://ssstik.io/',
            },
            timeout: 16000,
            signal: AbortSignal.timeout(18000),
        }
    );
    const html = String(dlRes.data || '');
    const videoMatches = [...html.matchAll(/href="(https:\/\/tikcdn\.io\/ssstik\/[^"]+)"/g)]
        .map(m => cleanEscapedUrl(m[1]));
    const audioMatch = html.match(/href="(https:\/\/[^"]*(?:tikcdn\.io|mp3)[^"]*)"[^>]*>[^<]*(?:MP3|Music)/i)?.[1];
    const titleMatch = html.match(/class="maintext"[^>]*>([\s\S]*?)<\/p>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();

    if (!videoMatches.length) throw new Error('ssstik returned no download link');
    return resolveVerifiedCandidate({
        videoUrls: videoMatches,
        headers: { Referer: 'https://ssstik.io/' },
        audioUrl: cleanEscapedUrl(audioMatch),
        author: 'TikTok User',
        likes: 'N/A',
        title: titleMatch || 'TikTok Video',
        source: 'SSSTik',
    });
}

// ─── Strategy 3: Direct TikTok Desktop HTML + Session Cookie & Referer ────────
async function tryTikTokDirectWithCookies(url) {
    const res = await axios.get(url, {
        headers: {
            'User-Agent': UA_DESKTOP,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Upgrade-Insecure-Requests': '1',
        },
        timeout: 14000,
        signal: AbortSignal.timeout(16000),
        maxRedirects: 6,
    });

    const rawCookies = res.headers?.['set-cookie'] || [];
    const cookieHeader = Array.isArray(rawCookies)
        ? rawCookies.map(c => String(c).split(';')[0]).filter(Boolean).join('; ')
        : '';

    const html = String(res.data || '');
    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('TikTok rehydration JSON not found');

    const parsed = JSON.parse(m[1]);
    const item = parsed?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) throw new Error('TikTok video detail missing');

    const images = (item.imagePost?.images || [])
        .map(img => img?.imageURL?.urlList?.[0])
        .filter(Boolean);

    const bitrateUrls = Array.isArray(item.video?.bitrateInfo)
        ? item.video.bitrateInfo.flatMap(b => b?.PlayAddr?.UrlList || [])
        : [];
    const videoUrls = [
        item.video?.downloadAddr,
        item.video?.playAddr,
        ...bitrateUrls,
    ].map(cleanEscapedUrl).filter(Boolean);

    if (!videoUrls.length && !images.length) {
        throw new Error('No direct playAddr/images on TikTok page');
    }

    const reqHeaders = { Referer: 'https://www.tiktok.com/' };
    if (cookieHeader) reqHeaders.Cookie = cookieHeader;

    return resolveVerifiedCandidate({
        videoUrls,
        images,
        headers: reqHeaders,
        audioUrl: cleanEscapedUrl(item.music?.playUrl),
        author: item.author?.nickname || item.author?.uniqueId || 'TikTok User',
        likes: item.statsV2?.diggCount ?? item.stats?.diggCount ?? 'N/A',
        title: item.desc || 'TikTok Video',
        source: 'TikTokDirect',
    });
}

// ─── Strategy 4: NNTech Free TikTok API ──────────────────────────────────────
async function tryNnTech(url) {
    const { data } = await axios.get(
        `https://nntech-free-tt-api.vercel.app/api/tiktok/mp4?url=${encodeURIComponent(url)}`,
        {
            headers: { 'User-Agent': UA_DESKTOP },
            timeout: 14000,
            signal: AbortSignal.timeout(16000),
        }
    );
    const vUrl = cleanEscapedUrl(data?.download);
    if (!data?.status || !vUrl) throw new Error('NNTech returned no download link');
    return resolveVerifiedCandidate({
        videoUrls: [vUrl],
        headers: { Referer: 'https://www.tiktok.com/' },
        author: 'TikTok User',
        likes: 'N/A',
        title: data.title || 'TikTok Video',
        source: 'NNTech',
    });
}

// ─── Strategy 5: Downbloder Vercel API ────────────────────────────────────────
async function tryDownbloder(url) {
    const { data } = await axios.get(
        `https://tiktok-downbloder.vercel.app/?url=${encodeURIComponent(url)}`,
        {
            headers: { 'User-Agent': UA_DESKTOP },
            timeout: 14000,
            signal: AbortSignal.timeout(16000),
        }
    );
    const o = data?.result?.raw?.result;
    const vUrl = cleanEscapedUrl(o?.video);
    if (!data?.success || !vUrl) throw new Error('Downbloder returned no download link');
    return resolveVerifiedCandidate({
        videoUrls: [vUrl],
        headers: { Referer: 'https://www.tiktok.com/' },
        audioUrl: cleanEscapedUrl(o?.music),
        author: o?.author?.nickname || o?.author?.unique_id || 'TikTok User',
        likes: o?.statistics?.likeCount ?? 'N/A',
        title: o?.desc || 'TikTok Video',
        source: 'Downbloder',
    });
}

// ─── Strategy 6: rahad-all-downloader-v2 (handles download.no_watermark) ─────
async function tryAllDl(url) {
    const { alldl } = require('rahad-all-downloader-v2');
    const r = await Promise.race([
        alldl(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AllDL timeout')), 18000)),
    ]);
    const d = r?.data || {};
    const videoUrls = [
        d.download?.no_watermark,
        d.download?.watermark,
        d.videoUrl,
        d.download?.video,
        d.play,
        d.url,
    ].map(cleanEscapedUrl).filter(Boolean);
    const images = Array.isArray(d.images) ? d.images.map(cleanEscapedUrl).filter(Boolean) : [];
    if (!videoUrls.length && !images.length) throw new Error('AllDL returned no media URL');

    return resolveVerifiedCandidate({
        videoUrls,
        images,
        headers: { Referer: 'https://www.tiktok.com/' },
        audioUrl: cleanEscapedUrl(d.download?.music || d.download?.audio),
        author: d.owner?.nickname || d.owner?.username || d.author || 'TikTok User',
        likes: d.stats?.likes ?? d.likes ?? 'N/A',
        title: d.title || 'TikTok Video',
        source: 'AllDL',
    });
}

// ─── Strategy 7: yt-dlp fallback (Docker / Render) ───────────────────────────
function tryYtDlpTikTok(url) {
    return new Promise((resolve, reject) => {
        const outPath = path.join(os.tmpdir(), `tt_ytdlp_${Date.now()}.mp4`);
        execFile('yt-dlp', [
            '--no-playlist',
            '--no-warnings',
            '--extractor-args', 'tiktok:api_hostname=api22-normal-c-useast2a.tiktokv.com',
            '-f', 'b[ext=mp4]/best',
            '--max-filesize', '50M',
            '-o', outPath,
            url,
        ], { timeout: 35000 }, (err) => {
            try {
                if (fs.existsSync(outPath) && fs.statSync(outPath).size > 4096) {
                    const buf = fs.readFileSync(outPath);
                    try { fs.unlinkSync(outPath); } catch {}
                    if (!isHtmlBuffer(buf)) {
                        return resolve({
                            buffer: buf,
                            author: 'TikTok User',
                            likes: 'N/A',
                            title: 'TikTok Video',
                            source: 'yt-dlp',
                        });
                    }
                }
            } catch {}
            try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
            reject(err || new Error('yt-dlp TikTok failed'));
        });
    });
}

async function downloadTikTok(rawUrl) {
    const url = await resolveCanonicalTikTokUrl(rawUrl);
    const strategies = [
        { name: 'TikWM', fn: () => tryTikWm(url) },
        { name: 'SSSTik', fn: () => trySssTik(url) },
        { name: 'TikTokDirect', fn: () => tryTikTokDirectWithCookies(url) },
        { name: 'NNTech', fn: () => tryNnTech(url) },
        { name: 'Downbloder', fn: () => tryDownbloder(url) },
        { name: 'AllDL', fn: () => tryAllDl(url) },
        { name: 'yt-dlp', fn: () => tryYtDlpTikTok(url) },
    ];

    for (const strat of strategies) {
        try {
            const res = await strat.fn();
            if (res && (res.buffer || res.images?.length || res.filePath)) {
                return res;
            }
        } catch (e) {
            console.warn(`[TikTok] ${strat.name} failed: ${e.message}`);
        }
    }

    return null;
}

module.exports = {
    commands:    ['tiktok', 'tt', 'ttdl', 'tiktokdl'],
    description: 'Download a TikTok video without watermark',
    permission:  'public',
    group:       true,
    private:     true,
    downloadTikTok,
    fetchMediaBuffer,

    run: async (sock, message, args, { jid, sender, contextInfo }) => {
        const target = jid || sender;
        const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedText = quoted?.conversation
            || quoted?.extendedTextMessage?.text
            || quoted?.imageMessage?.caption
            || quoted?.videoMessage?.caption
            || '';
        const combined = `${args.join(' ')} ${quotedText}`.trim();
        const urlMatch = combined.match(/(?:https?:\/\/)?(?:www\.|m\.|vt\.|vm\.)?tiktok\.com\/[^\s<>]*/i);
        const rawMatched = urlMatch ? urlMatch[0].replace(/[),.!?]+$/, '') : '';
        const url = rawMatched ? (/^https?:\/\//i.test(rawMatched) ? rawMatched : `https://${rawMatched}`) : '';

        if (!url) {
            return sock.sendMessage(target, {
                text: '❌ *Invalid TikTok URL!*\n\n💡 *Example:* `.tiktok https://vt.tiktok.com/ZS...`',
                contextInfo
            }, { quoted: message });
        }

        await sock.sendMessage(target, {
            text: '⏳ *Processing TikTok Video...* _(Watermark-Free HD)_',
            contextInfo
        }, { quoted: message });

        const result = await downloadTikTok(url);

        if (!result || (!result.buffer && !result.images?.length && !result.filePath)) {
            return sock.sendMessage(target, {
                text: '❌ *Download failed.* Video may be private, region-restricted, or temporarily unavailable.',
                contextInfo
            }, { quoted: message });
        }

        const caption = [
            `🎵 *𝗧𝗔𝗟𝗛𝗔-𝗠𝗗 𝗧𝗜𝗞𝗧𝗢𝗞 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗𝗘𝗥*`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `📝 *Title:* ${(result.title || 'TikTok Video').slice(0, 80)}`,
            `👤 *Author:* ${result.author || 'TikTok User'}`,
            `❤️ *Likes:* ${result.likes ?? 'N/A'}`,
            `⚡ *Source:* ${result.source}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `👑 *Owner:* Talha Sheikh`,
            `📢 *Channel:* https://whatsapp.com/channel/0029Vb8l5Yd2f3EBHMz87B2S`
        ].join('\n');

        // Photo slideshow mode
        if (Array.isArray(result.images) && result.images.length) {
            try {
                for (let i = 0; i < result.images.length; i++) {
                    await sock.sendMessage(target, {
                        image: result.images[i],
                        mimetype: 'image/jpeg',
                        caption: i === 0 ? caption : `📸 _(${i + 1}/${result.images.length})_`,
                        contextInfo,
                    }, i === 0 ? { quoted: message } : {});
                }
            } catch (e) {
                return sock.sendMessage(target, {
                    text: `❌ *Error sending TikTok images:* ${e.message}`,
                    contextInfo,
                }, { quoted: message });
            }
            return;
        }

        try {
            const payload = result.buffer
                || (result.filePath && fs.existsSync(result.filePath) ? fs.readFileSync(result.filePath) : null);
            if (!payload) throw new Error('Empty media payload');

            await sock.sendMessage(target, {
                video: payload,
                mimetype: 'video/mp4',
                caption,
                contextInfo
            }, { quoted: message });
        } catch (e) {
            return sock.sendMessage(target, {
                text: `❌ *Error sending video:* ${e.message}`,
                contextInfo
            }, { quoted: message });
        } finally {
            if (result.filePath) {
                try { if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath); } catch {}
            }
        }
    }
};
