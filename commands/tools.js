const axios = require('axios');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const config = require('../config');
const theme = require('../lib/theme');

module.exports = {
  sticker: {
    desc: "Convert image or short video to WhatsApp sticker",
    category: "tools",
    execute: async (sock, m, { reply, from, quoted, prefix }) => {
      let targetMessage = null;

      if (quoted && (quoted.quotedMessage?.imageMessage || quoted.quotedMessage?.videoMessage)) {
        targetMessage = {
          key: {
            remoteJid: from,
            id: quoted.stanzaId,
            participant: quoted.participant
          },
          message: quoted.quotedMessage
        };
      } else if (m.message?.imageMessage || m.message?.videoMessage) {
        targetMessage = m;
      }

      if (!targetMessage) {
        return reply(theme.errorCard('sticker', `Kisi photo ya short video par reply karke \`${prefix}sticker\` likhein!`));
      }

      await reply(theme.resultCard('✨', 'CRAFTING STICKER', [
        `🖼️ *Media:* Detected`,
        `🎨 *Pack:* ${config.PACK_NAME || 'Talha-MD Hero Pack'}`,
        `⚡ *Processing:* Fast WebP Conversion...`
      ]));

      try {
        const buffer = await downloadMediaMessage(
          targetMessage,
          'buffer',
          {},
          {
            logger: console,
            reuploadRequest: sock.updateMediaMessage
          }
        );

        const sticker = new Sticker(buffer, {
          pack: config.PACK_NAME || 'TALHA-MD',
          author: config.AUTHOR || 'Talha Sheikh',
          type: StickerTypes.FULL,
          categories: ['😎', '⚡', '🕷️'],
          quality: 75
        });

        const stickerBuffer = await sticker.toBuffer();
        await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
      } catch (e) {
        console.error('[Sticker Error]:', e);
        await reply(theme.errorCard('sticker', e.message));
      }
    }
  },

  s: {
    desc: "Alias for .sticker",
    category: "tools",
    execute: async (sock, m, extra) => {
      return module.exports.sticker.execute(sock, m, extra);
    }
  },

  toimg: {
    desc: "Convert sticker back into image photo",
    category: "tools",
    execute: async (sock, m, { reply, from, quoted, prefix }) => {
      if (!quoted || !quoted.quotedMessage?.stickerMessage) {
        return reply(theme.errorCard('toimg', `Kisi sticker par reply karke \`${prefix}toimg\` likhein!`));
      }

      await reply(theme.resultCard('🔄', 'CONVERTING STICKER', [
        `🎭 *Input:* WebP Sticker`,
        `🖼️ *Output:* High Res JPEG`,
        `⏳ *Converting...*`
      ]));

      try {
        const targetMessage = {
          key: {
            remoteJid: from,
            id: quoted.stanzaId,
            participant: quoted.participant
          },
          message: quoted.quotedMessage
        };

        const buffer = await downloadMediaMessage(
          targetMessage,
          'buffer',
          {},
          { logger: console, reuploadRequest: sock.updateMediaMessage }
        );

        const caption = theme.resultCard('✨', 'CONVERTED TO PHOTO', [
          `🖼️ *Format:* JPEG Photo`,
          `⚡ *Converted by:* ${config.BOT_NAME}`
        ]);

        await sock.sendMessage(from, {
          image: buffer,
          caption: caption
        }, { quoted: m });
      } catch (e) {
        console.error('[toimg error]:', e);
        await reply(theme.errorCard('toimg', e.message));
      }
    }
  },

  weather: {
    desc: "Get live weather forecast for any city",
    category: "tools",
    execute: async (sock, m, { text, reply }) => {
      const city = text ? text.trim() : "Lahore";
      try {
        const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%w+%h`, { timeout: 8000 });
        const parts = res.data.trim().split(' ');
        const card = theme.resultCard('🌦️', `WEATHER FORECAST: ${city.toUpperCase()}`, [
          `📍 *Location:* ${city.charAt(0).toUpperCase() + city.slice(1)}`,
          `🌡️ *Condition:* ${res.data.trim()}`,
          `🌐 *Live Data:* Real-time meteorological satellite`
        ], 'TALHA-MD Weather Intelligence');
        await reply(card);
      } catch (e) {
        await reply(theme.errorCard('weather', `Weather data fetch nahi ho saka: ${e.message}`));
      }
    }
  },

  crypto: {
    desc: "Get live cryptocurrency price",
    category: "tools",
    execute: async (sock, m, { args, reply, prefix }) => {
      let coin = (args[0] || "bitcoin").toLowerCase();
      if (coin === 'btc') coin = 'bitcoin';
      if (coin === 'eth') coin = 'ethereum';
      if (coin === 'sol') coin = 'solana';
      if (coin === 'doge') coin = 'dogecoin';

      try {
        const res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd,pkr`, { timeout: 8000 });
        if (!res.data[coin]) {
          return reply(theme.errorCard('crypto', `Coin '${coin}' nahi mila!\nTry: \`${prefix}crypto btc\` ya \`${prefix}crypto sol\``));
        }

        const usd = res.data[coin].usd;
        const pkr = res.data[coin].pkr;
        const card = theme.resultCard('💰', `CRYPTO TICKER: ${coin.toUpperCase()}`, [
          `🪙 *Asset:* ${coin.toUpperCase()}`,
          `💵 *USD Price:* $${usd.toLocaleString()}`,
          `🇵🇰 *PKR Rate:* Rs ${pkr ? pkr.toLocaleString() : 'N/A'}`,
          `⚡ *Source:* CoinGecko Real-time Feed`
        ], 'Crypto market fluctuates 24/7');
        await reply(card);
      } catch (e) {
        await reply(theme.errorCard('crypto', e.message));
      }
    }
  },

  quran: {
    desc: "Read Quran Surah verse with Urdu translation",
    category: "tools",
    execute: async (sock, m, { args, reply, prefix }) => {
      const surahNum = args[0] || "1";
      const ayahNum = args[1] || "1";
      try {
        const resAr = await axios.get(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}`, { timeout: 8000 });
        const resUr = await axios.get(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/ur.jalandhry`, { timeout: 8000 });

        const arText = resAr.data.data.text;
        const urText = resUr.data.data.text;
        const surahName = resAr.data.data.surah.englishName;

        const out = `┌───「 📖 *HOLY QURAN — SURAH ${surahName.toUpperCase()}* 」───
│ 🕋 *Verse:* Surah ${surahNum}, Ayah ${ayahNum}
└──────────────────────────────────────

${arText}

*Urdu Tarjuma:*
${urText}

──────────────────────────────────────
_📖 Recite daily • TALHA-MD Islamic Series_`;

        await reply(out);
      } catch (e) {
        await reply(theme.errorCard('quran', `Sahi tarika: \`${prefix}quran 1 1\` (Surah 1, Ayah 1).\nMasla: ${e.message}`));
      }
    }
  },

  tempmail: {
    desc: "Generate disposable temporary email address",
    category: "tools",
    execute: async (sock, m, { reply }) => {
      try {
        const res = await axios.get("https://api.guerrillamail.com/ajax.php?f=get_email_address", { timeout: 8000 });
        const email = res.data?.email_addr || `${Math.random().toString(36).substring(7)}@guerrillamail.com`;

        const card = theme.resultCard('📧', 'DISPOSABLE INBOX GENERATED', [
          `📫 *Email:* \`${email}\``,
          `⏳ *Validity:* 60 Minutes`,
          `🛡️ *Privacy:* 100% Anonymous`,
          `💡 *Usage:* Website signups, OTP & temporary forms`
        ], 'Click email above to copy with one tap!');

        await reply(card);
      } catch (e) {
        await reply(theme.errorCard('tempmail', e.message));
      }
    }
  }
};
