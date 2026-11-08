'use strict';

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const yts = require('yt-search');

/**
 * Search YouTube for a song or video query
 */
async function searchYouTube(query) {
    if (!query) throw new Error('Search query is required');

    // If query is already a valid YouTube URL
    const isUrl = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(query);
    if (isUrl) {
        try {
            const r = await yts(query);
            if (r?.videos?.length) {
                const v = r.videos[0];
                return {
                    title: v.title,
                    url: v.url,
                    duration: v.timestamp || '',
                    author: v.author?.name || 'YouTube',
                    thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
                    videoId: v.videoId
                };
            }
        } catch (_) {}

        const vidMatch = query.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        const vid = vidMatch ? vidMatch[1] : '';
        return {
            title: 'YouTube Track',
            url: query,
            duration: '',
            author: 'YouTube',
            thumbnail: vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : '',
            videoId: vid
        };
    }

    // Keyword search using yt-search
    try {
        const searchResult = await yts(query);
        const videos = searchResult?.videos || [];
        if (!videos.length) throw new Error(`No songs found matching: "${query}"`);

        const v = videos[0];
        return {
            title: v.title,
            url: v.url,
            duration: v.timestamp || '',
            author: v.author?.name || 'YouTube',
            thumbnail: v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`,
            videoId: v.videoId
        };
    } catch (err) {
        // Fallback: yt-dlp search
        return new Promise((resolve, reject) => {
            const escaped = query.replace(/"/g, '\\"');
            exec(`yt-dlp "ytsearch1:${escaped}" --print "%(title)s:::%(webpage_url)s:::%(duration_string)s:::%(uploader)s:::%(id)s"`, (error, stdout) => {
                if (error || !stdout.trim()) return reject(new Error(`Could not find song: ${query}`));
                const parts = stdout.trim().split(':::');
                resolve({
                    title: parts[0] || query,
                    url: parts[1] || `https://www.youtube.com/watch?v=${parts[4] || ''}`,
                    duration: parts[2] || '',
                    author: parts[3] || 'YouTube',
                    thumbnail: parts[4] ? `https://img.youtube.com/vi/${parts[4]}/hqdefault.jpg` : '',
                    videoId: parts[4] || ''
                });
            });
        });
    }
}

/**
 * Download YouTube audio as an MP3 Buffer/File
 */
async function downloadAudio(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required');

    // Strategy 1: Local yt-dlp (Fast, 100% reliable)
    const randomId = Math.random().toString(36).substring(2, 9);
    const tempPrefix = path.join(os.tmpdir(), `talha_audio_${Date.now()}_${randomId}`);
    const finalMp3Path = `${tempPrefix}.mp3`;

    try {
        await new Promise((resolve, reject) => {
            const cmd = `yt-dlp -x --audio-format mp3 --no-warnings --max-filesize 35M -o "${tempPrefix}.%(ext)s" "${videoUrl}"`;
            exec(cmd, { timeout: 45000 }, (error, stdout, stderr) => {
                if (error) return reject(error);
                resolve(stdout);
            });
        });

        // Check if output MP3 or audio exists
        if (fs.existsSync(finalMp3Path)) {
            const buffer = fs.readFileSync(finalMp3Path);
            try { fs.unlinkSync(finalMp3Path); } catch (_) {}
            return { buffer, type: 'buffer', mimetype: 'audio/mpeg' };
        }

        // Check if webm/m4a exists as fallback
        const files = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(path.basename(tempPrefix)));
        if (files.length) {
            const foundFile = path.join(os.tmpdir(), files[0]);
            const buffer = fs.readFileSync(foundFile);
            try { fs.unlinkSync(foundFile); } catch (_) {}
            return { buffer, type: 'buffer', mimetype: 'audio/mpeg' };
        }
    } catch (e) {
        console.warn(`[YouTubeDL] yt-dlp local audio download notice: ${e.message}`);
    }

    // Strategy 2: Fast Public APIs Fallback
    const apis = [
        `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(videoUrl)}`,
        `https://bk9.fun/download/youtube?url=${encodeURIComponent(videoUrl)}`,
        `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`
    ];

    for (const api of apis) {
        try {
            const res = await axios.get(api, { timeout: 15000 });
            const downloadUrl = res.data?.result?.download?.url 
                             || res.data?.result?.url 
                             || res.data?.data?.url
                             || res.data?.BK9?.download?.url;
            if (downloadUrl) {
                return { url: downloadUrl, type: 'url', mimetype: 'audio/mpeg' };
            }
        } catch (_) {}
    }

    throw new Error('Could not download audio stream. Please check link or try another song title.');
}

/**
 * Download YouTube video as MP4
 */
async function downloadVideo(videoUrl) {
    if (!videoUrl) throw new Error('Video URL is required');

    const randomId = Math.random().toString(36).substring(2, 9);
    const tempPrefix = path.join(os.tmpdir(), `talha_vid_${Date.now()}_${randomId}`);
    const finalMp4Path = `${tempPrefix}.mp4`;

    try {
        await new Promise((resolve, reject) => {
            const cmd = `yt-dlp -f "mp4[height<=720]/best[ext=mp4]/best" --no-warnings --max-filesize 50M -o "${tempPrefix}.%(ext)s" "${videoUrl}"`;
            exec(cmd, { timeout: 60000 }, (error, stdout) => {
                if (error) return reject(error);
                resolve(stdout);
            });
        });

        if (fs.existsSync(finalMp4Path)) {
            const buffer = fs.readFileSync(finalMp4Path);
            try { fs.unlinkSync(finalMp4Path); } catch (_) {}
            return { buffer, type: 'buffer', mimetype: 'video/mp4' };
        }
    } catch (e) {
        console.warn(`[YouTubeDL] yt-dlp video download notice: ${e.message}`);
    }

    // Fallback: Web API
    try {
        const res = await axios.get(`https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
        const vUrl = res.data?.result?.download?.url || res.data?.result?.url;
        if (vUrl) return { url: vUrl, type: 'url', mimetype: 'video/mp4' };
    } catch (_) {}

    throw new Error('Could not download video stream.');
}

module.exports = {
    searchYouTube,
    downloadAudio,
    downloadVideo
};
