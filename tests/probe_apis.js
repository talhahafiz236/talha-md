'use strict';
const axios = require('axios');

async function probe(url, params = {}) {
    try {
        const res = await axios.get(url, { params, timeout: 7000 });
        console.log(`[OK ${res.status}] ${url.split('?')[0]} -> ${JSON.stringify(res.data).substring(0, 100)}`);
        return res.data;
    } catch (e) {
        // console.log(`[ERR ${e.response?.status || e.code}] ${url.split('?')[0]}`);
        return null;
    }
}

async function run() {
    const ig = 'https://www.instagram.com/reel/C8qA_eQpG_z/';
    const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const tt = 'https://www.tiktok.com/@mrbeast/video/7331908381831859498';

    console.log('Testing Instagram candidates:');
    await probe('https://api.siputzx.my.id/api/d/instagram', { url: ig });
    await probe('https://api.siputzx.my.id/api/d/ig', { url: ig });
    await probe('https://api.siputzx.my.id/api/downloader/instagram', { url: ig });
    await probe('https://bk9.fun/download/instagram', { url: ig });
    await probe('https://api.guruapi.tech/insta/v1/igdl', { url: ig });
    await probe('https://api.ryzendesu.vip/api/downloader/igdl', { url: ig });
    await probe('https://api.nexoracle.com/downloader/instagram', { url: ig });
    await probe('https://itzpire.com/download/instagram', { url: ig });
    await probe('https://api.cafirexos.com/api/instagram', { url: ig });
    await probe('https://delirius-apiofc.vercel.app/download/instagram', { url: ig });
    await probe('https://delirius-apiofc.vercel.app/download/ig', { url: ig });

    console.log('\nTesting YouTube candidates:');
    await probe('https://api.siputzx.my.id/api/d/youtube', { url: yt });
    await probe('https://api.siputzx.my.id/api/d/ytplay', { query: 'despacito' });
    await probe('https://api.siputzx.my.id/api/d/play', { query: 'despacito' });
    await probe('https://bk9.fun/download/youtube', { url: yt });
    await probe('https://bk9.fun/download/ytmp3', { url: yt });
    await probe('https://bk9.fun/download/ytmp4', { url: yt });
    await probe('https://api.ryzendesu.vip/api/downloader/ytmp3', { url: yt });
    await probe('https://api.ryzendesu.vip/api/downloader/ytmp4', { url: yt });
    await probe('https://delirius-apiofc.vercel.app/download/ytmp3', { url: yt });
    await probe('https://delirius-apiofc.vercel.app/download/ytmp4', { url: yt });
    await probe('https://api.nexoracle.com/downloader/ytmp3', { url: yt });

    console.log('\nTesting TikTok candidates:');
    await probe('https://tikwm.com/api/', { url: tt });
    await probe('https://delirius-apiofc.vercel.app/download/tiktok', { url: tt });
    await probe('https://api.ryzendesu.vip/api/downloader/ttdl', { url: tt });
    await probe('https://api.siputzx.my.id/api/d/tiktok', { url: tt });
}

run();
