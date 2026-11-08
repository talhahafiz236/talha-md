'use strict';
const axios = require('axios');

async function testSiputzxPaths() {
    const testUrl = 'https://www.instagram.com/reel/C8qA_eQpG_z/';
    const paths = [
        '/api/d/ig',
        '/api/d/igdl',
        '/api/d/instagram',
        '/api/d/instagramdl',
        '/api/downloader/ig',
        '/api/downloader/instagram',
        '/api/d/reels',
        '/api/d/reel',
        '/api/s/instagram',
    ];

    for (const p of paths) {
        try {
            const res = await axios.get(`https://api.siputzx.my.id${p}?url=${encodeURIComponent(testUrl)}`, {
                timeout: 5000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            console.log(`[PASS ${res.status}] ${p}:`, JSON.stringify(res.data).substring(0, 100));
        } catch (e) {
            console.log(`[FAIL ${e.response?.status || e.message}] ${p}`);
        }
    }
}

testSiputzxPaths();
