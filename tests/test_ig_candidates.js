'use strict';
const axios = require('axios');

async function testIGCandidates() {
    const testReel = 'https://www.instagram.com/reel/C8qA_eQpG_z/';
    console.log('Testing IG candidates on:', testReel);

    const list = [
        'https://bk9.fun/download/instagram?url=' + encodeURIComponent(testReel),
        'https://aemt.me/download/ig?url=' + encodeURIComponent(testReel),
        'https://api.botcahx.eu.org/api/dowloader/igdowloader?url=' + encodeURIComponent(testReel),
        'https://api.guruapi.tech/insta/v1/igdl?url=' + encodeURIComponent(testReel),
        'https://api.fgmods.xyz/api/downloader/ig?url=' + encodeURIComponent(testReel) + '&apikey=fg-dylux',
        'https://api.cafirexos.com/api/instagram?url=' + encodeURIComponent(testReel),
    ];

    for (const url of list) {
        try {
            const res = await axios.get(url, { timeout: 6000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            console.log(`[PASS ${res.status}] ${url.split('?')[0]}`);
            console.log('  Data:', JSON.stringify(res.data).substring(0, 100));
        } catch (e) {
            console.log(`[FAIL ${e.response?.status || e.message}] ${url.split('?')[0]}`);
        }
    }
}

testIGCandidates();
