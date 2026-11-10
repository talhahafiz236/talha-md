'use strict';
const axios = require('axios');

let capitalCache = null;
let infoCache = null;

async function getCountriesInfoList() {
    if (infoCache) return infoCache;
    const res = await axios.get(
        'https://countriesnow.space/api/v0.1/countries/info?returns=currency,flag,unicodeFlag,dialCode',
        { timeout: 15000 }
    );
    const list = Array.isArray(res.data?.data) ? res.data.data : [];
    if (list.length) infoCache = list;
    return list;
}

async function getCapitalsList() {
    if (capitalCache) return capitalCache;
    const res = await axios.get('https://countriesnow.space/api/v0.1/countries/capital', { timeout: 15000 });
    const list = Array.isArray(res.data?.data) ? res.data.data : [];
    if (list.length) capitalCache = list;
    return list;
}

function matchCountry(list, query) {
    const q = query.trim().toLowerCase();
    const aliases = { usa: 'united states', uk: 'united kingdom', uae: 'united arab emirates', ksa: 'saudi arabia', pk: 'pakistan' };
    const norm = aliases[q] || q;
    return list.find(c => String(c.name || '').toLowerCase() === norm)
        || list.find(c => String(c.iso2 || '').toLowerCase() === norm || String(c.iso3 || '').toLowerCase() === norm)
        || list.find(c => String(c.name || '').toLowerCase().includes(norm));
}

module.exports = {
    commands:    ['country', 'countryinfo'],
    description: 'Get detailed information about any country',
    usage:       '.country <name>',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, ctx) => {
        const { contextInfo } = ctx;
        const jid = ctx.jid || message.key.remoteJid;
        if (!args.length) {
            return sock.sendMessage(jid, { text: `❌ *Usage:* \`.country <name>\`\n\nExample: \`.country Pakistan\``, contextInfo }, { quoted: message });
        }
        const query = args.join(' ').trim();

        try {
            const [infoRes, capRes, wbRes] = await Promise.allSettled([
                getCountriesInfoList(),
                getCapitalsList(),
                axios.get('https://api.worldbank.org/v2/country?format=json&per_page=300', { timeout: 10000 }),
            ]);

            const infoList = infoRes.status === 'fulfilled' ? infoRes.value : [];
            const capList  = capRes.status === 'fulfilled' ? capRes.value : [];
            const wbRaw    = wbRes.status === 'fulfilled' && Array.isArray(wbRes.value.data?.[1]) ? wbRes.value.data[1] : [];

            const cn  = matchCountry(infoList, query);
            const cap = matchCountry(capList, query);

            const qNorm = (cn?.name || cap?.name || query).toLowerCase();
            const wbCountries = wbRaw.filter(c => c.region && c.region.id !== 'NA');
            const wb = wbCountries.find(c => c.name?.toLowerCase() === qNorm || c.iso2Code?.toLowerCase() === query.toLowerCase())
                    || wbCountries.find(c => c.name?.toLowerCase().includes(query.toLowerCase()));

            if (!cn && !cap && !wb) throw new Error('not found');

            const countryName = cn?.name || cap?.name || wb?.name || query;

            // Fetch latest population asynchronously if country name known
            let popText = 'N/A';
            try {
                const popRes = await axios.post(
                    'https://countriesnow.space/api/v0.1/countries/population',
                    { country: countryName },
                    { timeout: 6000 }
                );
                const latest = popRes.data?.data?.populationCounts?.slice(-1)?.[0];
                if (latest?.value) popText = `${Number(latest.value).toLocaleString()} (${latest.year})`;
            } catch {}

            const flag     = cn?.unicodeFlag || '🌍';
            const currency = cn?.currency || 'N/A';
            const dialCode = cn?.dialCode ? (String(cn.dialCode).startsWith('+') ? cn.dialCode : `+${cn.dialCode}`) : 'N/A';
            const capital  = cap?.capital || wb?.capitalCity || 'N/A';
            const region   = wb?.region?.value || 'N/A';
            const income   = wb?.incomeLevel?.value || '';

            await sock.sendMessage(jid, {
                text:
                    `${flag} *${countryName}*\n\n` +
                    `🏙️ *Capital:* ${capital}\n` +
                    `🌍 *Region:* ${region}\n` +
                    `👥 *Population:* ${popText}\n` +
                    `💰 *Currency:* ${currency}\n` +
                    `📞 *Dial Code:* ${dialCode}\n` +
                    (income && income !== 'Aggregates' ? `💼 *Income Level:* ${income}\n` : '') +
                    `\n🔗 https://en.wikipedia.org/wiki/${encodeURIComponent(countryName.replace(/\s+/g, '_'))}`,
                contextInfo
            }, { quoted: message });
        } catch {
            await sock.sendMessage(jid, {
                text: `❌ Country *"${query}"* not found.\n\n_Try a full name like "Pakistan", "Kenya", "United States", "Germany"_`,
                contextInfo
            }, { quoted: message });
        }
    }
};
