'use strict';
const axios = require('axios');

async function testInstagramAPIs() {
    const testReel = 'https://www.instagram.com/reel/C8qA_eQpG_z/';
    console.log('Testing Instagram APIs on:', testReel);

    // 1. Check if Siputzx has another working path
    const candidates = [
        'https://api.siputzx.my.id/api/d/igdl?url=' + encodeURIComponent(testReel),
        'https://api.siputzx.my.id/api/d/instagram?url=' + encodeURIComponent(testReel),
        'https://delirius-apiofc.vercel.app/download/instagram?url=' + encodeURIComponent(testReel),
        'https://api.agatz.xyz/api/instagram?url=' + encodeURIComponent(testReel),
        'https://vkrdownloader.vercel.app/server?vurl=' + encodeURIComponent(testReel),
        'https://instasave.website/api/convert',
    ];

    for (const c of candidates) {
        try {
            const res = await axios.get(c, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            console.log(`[PASS] ${c.split('?')[0]} -> Status: ${res.status}`);
            console.log('       Data:', JSON.stringify(res.data).substring(0, 120));
        } catch (e) {
            console.log(`[FAIL] ${c.split('?')[0]} -> ${e.response?.status || e.message}`);
        }
    }
}

testInstagramAPIs();
