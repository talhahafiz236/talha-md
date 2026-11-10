'use strict';
const axios = require('axios');

module.exports = {
    commands:    ['currency', 'convert', 'rate'],
    description: 'Convert between currencies',
    usage:       '.currency <amount> <FROM> <TO>',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = message.key.remoteJid;
        if (args.length < 3) {
            return sock.sendMessage(jid, {
                text: `❌ *Usage:* \`.currency <amount> <FROM> <TO>\`\n_Examples:_\n• \`.currency 100 USD KES\`\n• \`.currency 50 EUR GBP\``,
                contextInfo
            }, { quoted: message });
        }
        const amount = parseFloat(args[0]);
        const from   = args[1].toUpperCase();
        const to     = args[2].toUpperCase();
        if (isNaN(amount) || amount <= 0) {
            return sock.sendMessage(jid, { text: `❌ Invalid amount.`, contextInfo }, { quoted: message });
        }
        try {
            let rate = null;
            let asOf = new Date().toISOString().split('T')[0];

            try {
                const res = await axios.get('https://api.frankfurter.app/latest', {
                    params: { amount, from, to },
                    timeout: 8000,
                });
                if (res.data?.rates?.[to]) {
                    rate = res.data.rates[to];
                    asOf = res.data.date || asOf;
                }
            } catch {}

            // Fallback for currencies not supported by ECB/Frankfurter (e.g. PKR, KES, NGN, AED, SAR)
            if (rate === null) {
                const res = await axios.get(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, { timeout: 15000 });
                const unitRate = res.data?.rates?.[to];
                if (!unitRate) throw new Error(`Currency "${to}" not found`);
                rate = amount * unitRate;
                if (res.data?.time_last_update_utc) {
                    asOf = res.data.time_last_update_utc.split(' ').slice(0, 4).join(' ');
                }
            }

            await sock.sendMessage(jid, {
                text: `💱 *Currency Conversion*\n\n💵 *${amount.toLocaleString()} ${from}* → *${Number(rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${to}*\n\n📅 _Rate as of ${asOf}_`,
                contextInfo
            }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ Conversion failed: ${err.message}`,
                contextInfo
            }, { quoted: message });
        }
    }
};
