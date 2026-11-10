'use strict';

const axios    = require('axios');
const { getStr } = require('../lib/theme');
const OWM_KEY = '060a6bcfa19809c2cd4d97a212b19273';

module.exports = {
    commands:    ['weather', 'climate', 'mosam'],
    description: 'Get current weather for a location',
    permission:  'public',
    group:       true,
    private:     true,
    run: async (sock, message, args, { jid, groupId, sender, contextInfo }) => {
        const chatId = jid || groupId || sender;
        if (!args.length) {
            return sock.sendMessage(chatId, {
                text: '❌ Please provide a location.\nExample: .weather Nairobi',
                contextInfo
            }, { quoted: message });
        }

        const location = args.join(' ');
        const loading  = await sock.sendMessage(chatId, {
            text: '⏳ Fetching weather data...',
            contextInfo
        }, { quoted: message });

        try {
            const { data } = await axios.get(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&units=metric&appid=${OWM_KEY}`,
                { timeout: 10000 }
            );

            const iconUrl = `https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png`;

            if (loading) await sock.sendMessage(chatId, { delete: loading.key }).catch(() => {});

            await sock.sendMessage(chatId, {
                image:   { url: iconUrl },
                caption:
`🌍 *${data.name}, ${data.sys.country} — Weather Report*
📅 ${new Date().toUTCString()}

🌡️ Temp: ${data.main.temp}°C  (min ${data.main.temp_min}°C / max ${data.main.temp_max}°C)
💧 Humidity: ${data.main.humidity}%
💨 Wind: ${data.wind.speed} km/h
🌤️ ${data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1)}

_Powered by ${getStr('botName') || 'TALHA MD'}_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            console.error('[Weather]', err.message);
            if (loading) await sock.sendMessage(chatId, { delete: loading.key }).catch(() => {});
            const msg = err.response?.status === 404
                ? '❌ Location not found. Please check the name.'
                : '❌ Failed to fetch weather. Try again later.';
            await sock.sendMessage(chatId, { text: msg, contextInfo }, { quoted: message });
        }
    }
};
