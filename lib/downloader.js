const { exec } = require('child_process');
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

  // Fast Download Audio (MP3) using optimized yt-dlp flags
  downloadAudio(queryOrUrl) {
    return new Promise(async (resolve, reject) => {
      let target = queryOrUrl;
      let meta = {
        title: "Audio Track",
        author: "Unknown Artist",
        duration: "0:00",
        url: queryOrUrl
      };

      if (!queryOrUrl.startsWith('http')) {
        const video = await this.searchYoutube(queryOrUrl);
        if (!video) return reject(new Error("Gaana nahi mila! Naam sahi likhein."));
        target = video.url;
        meta.title = video.title.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 40).trim();
        meta.author = video.author?.name || "YouTube";
        meta.duration = video.duration?.timestamp || "N/A";
        meta.url = video.url;
      }

      const fileId = 'audio_' + Date.now();
      const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);

      // Ultra-optimized flags:
      // --no-playlist: do not crawl playlist
      // --extract-audio --audio-format mp3 --audio-quality 5: lightning fast encoding
      // --concurrent-fragments 4: fast chunked download
      const cmd = `yt-dlp --no-playlist --concurrent-fragments 4 --extract-audio --audio-format mp3 --audio-quality 5 --max-filesize 30M --no-warnings -o "${outputPath}" "${target}"`;

      exec(cmd, { timeout: 45000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[yt-dlp Audio Error]:', stderr || err.message);
          return reject(new Error(stderr || err.message || "Download fail ho gaya!"));
        }

        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          const filePath = path.join(TEMP_DIR, files[0]);
          resolve({ filePath, ...meta });
        } else {
          reject(new Error("Audio file generate nahi ho saki!"));
        }
      });
    });
  }

  // Fast Download Video (MP4) using optimized yt-dlp flags
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

      // Fast 720p or 480p single stream for rapid WhatsApp delivery
      const cmd = `yt-dlp --no-playlist --concurrent-fragments 4 -f "best[height<=720]/best" --merge-output-format mp4 --max-filesize 50M --no-warnings -o "${outputPath}" "${target}"`;

      exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[yt-dlp Video Error]:', stderr || err.message);
          return reject(new Error(stderr || err.message || "Video download fail ho gaya!"));
        }

        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          const filePath = path.join(TEMP_DIR, files[0]);
          resolve({ filePath, ...meta });
        } else {
          reject(new Error("Video file generate nahi ho saki!"));
        }
      });
    });
  }

  // TikTok Downloader via tikwm with fast fallback
  async downloadTikTok(url) {
    try {
      const res = await axios.post('https://www.tikwm.com/api/', `url=${encodeURIComponent(url)}`, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 12000
      });
      if (res.data?.code === 0 && res.data?.data) {
        return {
          title: res.data.data.title || "TikTok Video",
          videoUrl: res.data.data.play,
          author: res.data.data.author?.nickname || "TikTok User",
          likes: res.data.data.digg_count || 0
        };
      }
    } catch (e) {}

    // Fallback via yt-dlp
    return new Promise((resolve, reject) => {
      const fileId = 'tiktok_' + Date.now();
      const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);
      const cmd = `yt-dlp --no-playlist -f best --max-filesize 40M -o "${outputPath}" "${url}"`;

      exec(cmd, { timeout: 30000 }, (err) => {
        if (err) return reject(new Error("TikTok fetch nahi ho saka!"));
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          resolve({ filePath: path.join(TEMP_DIR, files[0]), title: "TikTok Video" });
        } else {
          reject(new Error("TikTok file nahi mili!"));
        }
      });
    });
  }

  // Instagram Downloader
  async downloadInstagram(url) {
    return new Promise((resolve, reject) => {
      const fileId = 'insta_' + Date.now();
      const outputPath = path.join(TEMP_DIR, `${fileId}.%(ext)s`);
      const cmd = `yt-dlp --no-playlist -f best --max-filesize 50M -o "${outputPath}" "${url}"`;

      exec(cmd, { timeout: 35000 }, (err) => {
        if (err) return reject(new Error("Instagram video fetch nahi ho saki!"));
        const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId));
        if (files.length > 0) {
          resolve({ filePath: path.join(TEMP_DIR, files[0]), title: "Instagram Reel" });
        } else {
          reject(new Error("Instagram file nahi mili!"));
        }
      });
    });
  }
}

module.exports = new MediaDownloader();
