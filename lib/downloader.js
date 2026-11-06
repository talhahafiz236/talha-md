const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const yts = require('yt-search');

const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

class MediaDownloader {
  // YouTube Search with cache and timeout
  async searchYoutube(query) {
    try {
      const r = await yts(query);
      return r.videos?.[0] || null;
    } catch (e) {
      console.error('[Downloader] yts error:', e.message);
      return null;
    }
  }

  // Fast & Bulletproof Audio (MP3) Downloader
  downloadAudio(queryOrUrl) {
    return new Promise(async (resolve, reject) => {
      const isUrl = queryOrUrl.startsWith('http://') || queryOrUrl.startsWith('https://');
      let meta = {
        title: "Audio Track",
        author: "Unknown Artist",
        duration: "0:00",
        url: queryOrUrl
      };

      if (!isUrl) {
        try {
          const video = await this.searchYoutube(queryOrUrl);
          if (video) {
            meta.title = video.title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 45).trim();
            meta.author = video.author?.name || "Music Artist";
            meta.duration = video.duration?.timestamp || "N/A";
            meta.url = video.url;
          }
        } catch (e) {}
      }

      const fileId = 'audio_' + Date.now();
      const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

      const checkResult = () => {
        try {
          const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
          if (files.length > 0) {
            const filePath = path.join(TEMP_DIR, files[0]);
            return { filePath, ...meta };
          }
        } catch (e) {}
        return null;
      };

      // Strategy 1: YouTube Android Player Client Bypass (Bypasses SABR-only streaming & datacenter IP blocks)
      const tryYouTube = () => {
        return new Promise((res, rej) => {
          const target = (meta.url && meta.url.startsWith('http')) 
            ? meta.url 
            : `ytsearch1:${queryOrUrl}`;
          const args = [
            '--no-playlist',
            '--extractor-args', 'youtube:player_client=android,web',
            '-f', '18/ba/b',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '5',
            '--max-filesize', '30M',
            '--no-warnings',
            '-o', outputPath,
            target
          ];

          execFile('yt-dlp', args, { timeout: 70000 }, (err) => {
            const result = checkResult();
            if (result) return res(result);
            rej(err || new Error("YouTube audio fetch failed"));
          });
        });
      };

      // Strategy 2: SoundCloud Fallback (Zero datacenter restrictions)
      const trySoundCloud = () => {
        return new Promise((res, rej) => {
          const cleanQuery = (meta.title && meta.title !== "Audio Track") 
            ? meta.title 
            : queryOrUrl.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
          const args = [
            '--no-playlist',
            '-f', 'bestaudio/ba/b',
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '5',
            '--max-filesize', '30M',
            '--no-warnings',
            '-o', outputPath,
            `scsearch1:${cleanQuery}`
          ];

          execFile('yt-dlp', args, { timeout: 60000 }, (err) => {
            const result = checkResult();
            if (result) return res(result);
            rej(err || new Error("SoundCloud audio fetch failed"));
          });
        });
      };

      // Execute YouTube bypass first, fall back to SoundCloud
      tryYouTube()
        .then(resolve)
        .catch(() => {
          if (!isUrl) {
            trySoundCloud().then(resolve).catch(reject);
          } else {
            reject(new Error("Audio download fail ho gaya! URL sahi check karein."));
          }
        });
    });
  }

  // Fast Video (MP4) using android player client bypass
  downloadVideo(queryOrUrl) {
    return new Promise(async (resolve, reject) => {
      let target = queryOrUrl;
      let meta = {
        title: "Video Track",
        author: "Unknown Creator",
        duration: "0:00",
        url: queryOrUrl
      };

      if (!queryOrUrl.startsWith('http')) {
        const video = await this.searchYoutube(queryOrUrl);
        if (!video) return reject(new Error("Video nahi mili! Naam sahi likhein."));
        target = video.url;
        meta.title = video.title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 40).trim();
        meta.author = video.author?.name || "YouTube";
        meta.duration = video.duration?.timestamp || "N/A";
        meta.url = video.url;
      }

      const fileId = 'video_' + Date.now();
      const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

      const args = [
        '--no-playlist',
        '--extractor-args', 'youtube:player_client=android,web',
        '-f', '18/best[height<=720]/best',
        '--merge-output-format', 'mp4',
        '--max-filesize', '50M',
        '--no-warnings',
        '-o', outputPath,
        target
      ];

      execFile('yt-dlp', args, { timeout: 80000 }, (err, stdout, stderr) => {
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          const filePath = path.join(TEMP_DIR, files[0]);
          resolve({ filePath, ...meta });
        } else {
          console.error('[yt-dlp Video Error]:', stderr || err?.message);
          reject(new Error(stderr || err?.message || "Video download fail ho gaya!"));
        }
      });
    });
  }

  // Fast & Bulletproof TikTok Downloader
  async downloadTikTok(rawInput) {
    const urlMatch = rawInput.match(/https?:\/\/[^\s]+/i);
    const targetUrl = urlMatch ? urlMatch[0].trim() : rawInput.trim();
    const fileId = 'tiktok_' + Date.now();
    const outputPath = path.join(TEMP_DIR, `${fileId}.mp4`);

    // Strategy 1: High-speed tikwm API + direct axios stream
    try {
      const res = await axios.post('https://www.tikwm.com/api/', `url=${encodeURIComponent(targetUrl)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });

      if (res.data?.code === 0 && res.data?.data) {
        const data = res.data.data;
        const playUrl = data.play || data.wmplay;
        if (playUrl) {
          const vidRes = await axios.get(playUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.tiktok.com/'
            },
            responseType: 'arraybuffer',
            timeout: 30000
          });

          fs.writeFileSync(outputPath, vidRes.data);
          return {
            filePath: outputPath,
            title: data.title || "TikTok Video",
            author: data.author?.nickname || "TikTok Creator",
            likes: data.digg_count || 0
          };
        }
      }
    } catch (e) {
      console.error('[Downloader TikTok tikwm error]:', e.message);
    }

    // Strategy 2: yt-dlp fallback
    return new Promise((resolve, reject) => {
      const ytdlpOutputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);
      const args = [
        '--no-playlist',
        '-f', 'best',
        '--max-filesize', '50M',
        '--no-warnings',
        '-o', ytdlpOutputPath,
        targetUrl
      ];

      execFile('yt-dlp', args, { timeout: 45000 }, (err) => {
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          resolve({
            filePath: path.join(TEMP_DIR, files[0]),
            title: "TikTok Video",
            author: "TikTok User"
          });
        } else {
          reject(new Error("TikTok video fetch nahi ho saki! Link dobara check karein."));
        }
      });
    });
  }

  // Instagram Downloader
  async downloadInstagram(rawInput) {
    const urlMatch = rawInput.match(/https?:\/\/[^\s]+/i);
    const targetUrl = urlMatch ? urlMatch[0].trim() : rawInput.trim();
    const fileId = 'insta_' + Date.now();
    const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

    return new Promise((resolve, reject) => {
      const args = [
        '--no-playlist',
        '-f', 'best',
        '--max-filesize', '50M',
        '--no-warnings',
        '-o', outputPath,
        targetUrl
      ];

      execFile('yt-dlp', args, { timeout: 45000 }, (err) => {
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          resolve({
            filePath: path.join(TEMP_DIR, files[0]),
            title: "Instagram Reel"
          });
        } else {
          reject(new Error("Instagram video fetch nahi ho saki! Reel public honi chahiye."));
        }
      });
    });
  }
}

module.exports = new MediaDownloader();
