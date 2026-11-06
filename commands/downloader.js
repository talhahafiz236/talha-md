const fs = require('fs');
const downloader = require('../lib/downloader');
const theme = require('../lib/theme');
const config = require('../config');

module.exports = {
  song: {
    desc: "Download song/audio in high quality MP3",
    category: "downloader",
    execute: async (sock, m, { text, reply, from, prefix }) => {
      if (!text) {
        return reply(theme.errorCard('song', `Gaane ka naam ya YouTube link likhein!\nExample: \`${prefix}song Cheques\` ya \`${prefix}song Pasoori\``));
      }

      await reply(theme.resultCard('🎵', 'SEARCHING & PREPARING AUDIO', [
        `🔎 *Query:* "${text}"`,
        `🎧 *Format:* HD MP3 Audio`,
        `⚡ *Speed:* Multi-Engine Stream...`
      ], 'Bas kuch second intezar karein, gaana send ho raha hai! ⏳'));

      try {
        const { filePath, title, author, duration } = await downloader.downloadAudio(text);

        if (fs.existsSync(filePath)) {
          const caption = theme.resultCard('🎵', 'AUDIO DOWNLOAD COMPLETE', [
            `🏷️ *Title:* ${title}`,
            `🎤 *Artist:* ${author}`,
            `⏱️ *Duration:* ${duration}`,
            `👑 *Downloaded by:* ${config.BOT_NAME}`
          ], 'Obsidian Ultra-Fast Downloader');

          await sock.sendMessage(from, {
            audio: fs.readFileSync(filePath),
            mimetype: 'audio/mp4',
            fileName: `${title}.mp3`
          }, { quoted: m });

          // Send confirmation info card
          await reply(caption);

          // Clean up temp file
          setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }, 8000);
        } else {
          await reply(theme.errorCard('song', "Audio file generate nahi ho saki!"));
        }
      } catch (e) {
        console.error('[Command .song error]:', e);
        await reply(theme.errorCard('song', e.message));
      }
    }
  },

  play: {
    desc: "Alias for .song",
    category: "downloader",
    execute: async (sock, m, extra) => {
      return module.exports.song.execute(sock, m, extra);
    }
  },

  video: {
    desc: "Download YouTube video by name or link",
    category: "downloader",
    execute: async (sock, m, { text, reply, from, prefix }) => {
      if (!text) {
        return reply(theme.errorCard('video', `Video ka naam ya YouTube link likhein!\nExample: \`${prefix}video funny cartoon\` ya \`${prefix}video viral shorts\``));
      }

      await reply(theme.resultCard('🎬', 'FETCHING VIDEO STREAM', [
        `🔎 *Query:* "${text}"`,
        `📺 *Format:* 720p HD MP4 Video`,
        `⚡ *Status:* Downloading Video Chunks...`
      ], 'Please wait a few moments... 📥'));

      try {
        const { filePath, title, author, duration } = await downloader.downloadVideo(text);

        if (fs.existsSync(filePath)) {
          const caption = theme.resultCard('🎬', 'VIDEO DOWNLOAD COMPLETE', [
            `🏷️ *Title:* ${title}`,
            `👤 *Creator:* ${author}`,
            `⏱️ *Duration:* ${duration}`,
            `⚡ *Engine:* ${config.BOT_NAME} HD`
          ], 'Obsidian Ultra-Fast Video Streamer');

          await sock.sendMessage(from, {
            video: fs.readFileSync(filePath),
            caption: caption
          }, { quoted: m });

          setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }, 8000);
        } else {
          await reply(theme.errorCard('video', "Video file generate nahi ho saki!"));
        }
      } catch (e) {
        console.error('[Command .video error]:', e);
        await reply(theme.errorCard('video', e.message));
      }
    }
  },

  yt: {
    desc: "Alias for .video",
    category: "downloader",
    execute: async (sock, m, extra) => {
      return module.exports.video.execute(sock, m, extra);
    }
  },

  tiktok: {
    desc: "Download TikTok video without watermark",
    category: "downloader",
    execute: async (sock, m, { text, reply, from, prefix }) => {
      const urlMatch = text ? text.match(/https?:\/\/[^\s]+/i) : null;
      const link = urlMatch ? urlMatch[0].trim() : (text ? text.trim() : '');

      if (!link || (!link.includes('tiktok.com') && !link.includes('douyin'))) {
        return reply(theme.errorCard('tiktok', `Sahi TikTok video link daalein!\nExample: \`${prefix}tiktok https://vm.tiktok.com/...\``));
      }

      await reply(theme.resultCard('⚡', 'DOWNLOADING TIKTOK', [
        `🔗 *Link:* ${link.substring(0, 35)}...`,
        `✨ *Watermark:* Removed (100% Clean)`,
        `⏳ *Status:* Processing Video...`
      ]));

      try {
        const result = await downloader.downloadTikTok(link);

        if (result.filePath && fs.existsSync(result.filePath)) {
          const caption = theme.resultCard('✨', 'TIKTOK HD (NO WATERMARK)', [
            `🏷️ *Title:* ${result.title || 'TikTok Video'}`,
            `👤 *Author:* ${result.author || 'User'}`,
            `⚡ *Downloaded by:* ${config.BOT_NAME}`
          ]);

          await sock.sendMessage(from, {
            video: fs.readFileSync(result.filePath),
            caption: caption
          }, { quoted: m });

          setTimeout(() => {
            try { fs.unlinkSync(result.filePath); } catch (e) {}
          }, 8000);
        } else {
          await reply(theme.errorCard('tiktok', "TikTok video fetch nahi ho saki! Link dobara check karein."));
        }
      } catch (e) {
        console.error('[Command .tiktok error]:', e);
        await reply(theme.errorCard('tiktok', e.message));
      }
    }
  },

  insta: {
    desc: "Download Instagram Reel or Video",
    category: "downloader",
    execute: async (sock, m, { text, reply, from, prefix }) => {
      const urlMatch = text ? text.match(/https?:\/\/[^\s]+/i) : null;
      const link = urlMatch ? urlMatch[0].trim() : (text ? text.trim() : '');

      if (!link || !link.includes('instagram.com')) {
        return reply(theme.errorCard('insta', `Sahi Instagram Reel/Post link daalein!\nExample: \`${prefix}insta https://www.instagram.com/reel/...\``));
      }

      await reply(theme.resultCard('📸', 'FETCHING INSTAGRAM REEL', [
        `🔗 *Link:* ${link.substring(0, 35)}...`,
        `🎬 *Quality:* HD 1080p Stream`,
        `⏳ *Status:* Downloading...`
      ]));

      try {
        const { filePath, title } = await downloader.downloadInstagram(link);

        if (fs.existsSync(filePath)) {
          const caption = theme.resultCard('📸', 'INSTAGRAM REEL DOWNLOADED', [
            `🏷️ *Content:* ${title}`,
            `⚡ *Downloader:* ${config.BOT_NAME}`,
            `👑 *Quality:* 1080p MP4`
          ]);

          await sock.sendMessage(from, {
            video: fs.readFileSync(filePath),
            caption: caption
          }, { quoted: m });

          setTimeout(() => {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }, 8000);
        } else {
          await reply(theme.errorCard('insta', "Instagram video fetch nahi ho saki!"));
        }
      } catch (e) {
        console.error('[Command .insta error]:', e);
        await reply(theme.errorCard('insta', e.message));
      }
    }
  }
};
