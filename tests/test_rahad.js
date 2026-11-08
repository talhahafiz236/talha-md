'use strict';
const { alldl } = require('rahad-all-downloader-v2');

async function testAll() {
    console.log('Testing rahad-all-downloader-v2:');
    
    // 1. TikTok
    try {
        console.log('Testing TikTok...');
        const tt = await alldl('https://www.tiktok.com/@tiktok/video/7106594312292453678');
        console.log('[PASS] TikTok ->', tt?.data?.videoUrl ? 'Got videoUrl' : tt);
    } catch (e) {
        console.log('[FAIL] TikTok ->', e.message);
    }

    // 2. Facebook
    try {
        console.log('Testing Facebook...');
        const fb = await alldl('https://www.facebook.com/watch/?v=10153231379946729');
        console.log('[PASS] Facebook ->', fb?.data?.videoUrl ? 'Got videoUrl' : fb);
    } catch (e) {
        console.log('[FAIL] Facebook ->', e.message);
    }

    // 3. Instagram
    try {
        console.log('Testing Instagram...');
        const ig = await alldl('https://www.instagram.com/reel/C8qA_eQpG_z/');
        console.log('[PASS] Instagram ->', ig?.data?.videoUrl ? 'Got videoUrl' : ig);
    } catch (e) {
        console.log('[FAIL] Instagram ->', e.message);
    }

    // 4. YouTube
    try {
        console.log('Testing YouTube...');
        const yt = await alldl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        console.log('[PASS] YouTube ->', yt?.data?.videoUrl ? 'Got videoUrl' : yt);
    } catch (e) {
        console.log('[FAIL] YouTube ->', e.message);
    }
}

testAll();
