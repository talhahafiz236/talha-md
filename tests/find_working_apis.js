'use strict';
const axios = require('axios');

async function testEndpoint(name, url, options = {}) {
    try {
        const start = Date.now();
        const res = await axios({
            url,
            method: options.method || 'GET',
            data: options.data,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ...options.headers
            },
            timeout: 10000
        });
        const duration = Date.now() - start;
        console.log(`[PASS] ${name} (${duration}ms) - Status: ${res.status}`);
        const sample = JSON.stringify(res.data).substring(0, 150);
        console.log(`       Data: ${sample}...`);
        return { success: true, name, data: res.data };
    } catch (err) {
        console.log(`[FAIL] ${name} - Error: ${err.response?.status || err.message}`);
        return { success: false, name, error: err.message };
    }
}

async function run() {
    console.log('Testing APIs...');
    const testIg = 'https://www.instagram.com/reel/C8qA_eQpG_z/';
    const testFb = 'https://www.facebook.com/watch/?v=10153231379946729';
    const testTt = 'https://www.tiktok.com/@tiktok/video/7106594312292453678';
    const testYt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    console.log('\n--- TIKTOK ---');
    await testEndpoint('TikWM', `https://tikwm.com/api/?url=${encodeURIComponent(testTt)}`);
    await testEndpoint('Siputzx TikTok', `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(testTt)}`);
    await testEndpoint('DavidCyril TikTok', `https://api.davidcyriltech.my.id/download/tiktok?url=${encodeURIComponent(testTt)}`);
    await testEndpoint('Agatz TikTok', `https://api.agatz.xyz/api/tiktok?url=${encodeURIComponent(testTt)}`);

    console.log('\n--- INSTAGRAM ---');
    await testEndpoint('Siputzx IG', `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(testIg)}`);
    await testEndpoint('DavidCyril IG', `https://api.davidcyriltech.my.id/download/instagram?url=${encodeURIComponent(testIg)}`);
    await testEndpoint('Agatz IG', `https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(testIg)}`);
    await testEndpoint('VkrDownloader IG', `https://vkrdownloader.vercel.app/server?vurl=${encodeURIComponent(testIg)}`);
    await testEndpoint('Widipe IG', `https://widipe.com/download/igdl?url=${encodeURIComponent(testIg)}`);

    console.log('\n--- FACEBOOK ---');
    await testEndpoint('Siputzx FB', `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(testFb)}`);
    await testEndpoint('DavidCyril FB', `https://api.davidcyriltech.my.id/download/facebook?url=${encodeURIComponent(testFb)}`);
    await testEndpoint('Agatz FB', `https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(testFb)}`);

    console.log('\n--- YOUTUBE ---');
    await testEndpoint('Siputzx YTMP3', `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(testYt)}`);
    await testEndpoint('Siputzx YTMP4', `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(testYt)}`);
    await testEndpoint('DavidCyril YTMP3', `https://api.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(testYt)}`);
    await testEndpoint('DavidCyril YTMP4', `https://api.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(testYt)}`);
    await testEndpoint('Widipe YTMP3', `https://widipe.com/download/ytmp3?url=${encodeURIComponent(testYt)}`);
    await testEndpoint('Widipe YTMP4', `https://widipe.com/download/ytmp4?url=${encodeURIComponent(testYt)}`);
}

run();
