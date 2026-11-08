'use strict';
const axios = require('axios');
const qs = require('querystring');

const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const UA_IPHONE  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function extractShortcode(url) {
    const m = url.match(/instagram\.com\/(?:p|reel|tv|reels\/videos|stories\/[^/]+)\/([A-Za-z0-9_-]+)/);
    return m?.[1] || null;
}

// Strategy: Embed Page
async function testEmbedPage(url) {
    const shortcode = extractShortcode(url);
    const { data: html } = await axios.get(
        `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
        {
            headers: { 'User-Agent': UA_IPHONE, 'Accept': 'text/html' },
            timeout: 10000,
        }
    );
    const videoPatterns = [
        /"video_url":"(https:\\\/\\\/[^"]+\.mp4[^"]*)"/g,
        /"video_url":"(https:\/\/[^"]+\.mp4[^"]*)"/g,
        /src=\\?"(https:\\\/\\\/[^"]+\.mp4[^"]*)\\"?/g,
        /"url":"(https:[^"]+\.mp4[^"]*)"/g,
        /og:video.*?content="([^"]+)"/g,
    ];
    const results = [];
    for (const pat of videoPatterns) {
        let m;
        while ((m = pat.exec(html)) !== null) {
            const u = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/').replace(/&amp;/g, '&');
            if (u && !results.includes(u)) results.push(u);
        }
    }
    return results;
}

// Strategy: oEmbed
async function testOEmbed(url) {
    const { data } = await axios.get(
        `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&maxwidth=1080`,
        { headers: { 'User-Agent': UA_BROWSER }, timeout: 10000 }
    );
    return data;
}

// Strategy: FastDL
async function testFastDl(url) {
    const r = await axios.post('https://fastdl.app/api/convert',
        JSON.stringify({ url }),
        {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': UA_BROWSER,
                'Referer': 'https://fastdl.app/',
                'Origin': 'https://fastdl.app',
            },
            timeout: 10000,
        }
    );
    return r.data;
}

// Strategy: snapsave
async function testSnapsave(url) {
    const r1 = await axios.get('https://snapsave.app/', {
        headers: { 'User-Agent': UA_BROWSER },
        timeout: 10000,
    });
    const cookies = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const r2 = await axios.post('https://snapsave.app/action.php',
        qs.stringify({ url }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': cookies,
                'Referer': 'https://snapsave.app/',
                'Origin': 'https://snapsave.app',
                'User-Agent': UA_BROWSER,
            },
            timeout: 12000,
        }
    );
    return r2.data;
}

async function run() {
    const url = 'https://www.instagram.com/reel/C8qA_eQpG_z/';
    console.log('Testing Instagram strategies on:', url);

    try {
        console.log('Testing Embed Page...');
        const v = await testEmbedPage(url);
        console.log('Embed Page Result:', v.length ? v[0].substring(0, 80) : 'none');
    } catch (e) {
        console.log('Embed Page Error:', e.message);
    }

    try {
        console.log('Testing oEmbed...');
        const o = await testOEmbed(url);
        console.log('oEmbed Result:', o.title, o.thumbnail_url?.substring(0, 60));
    } catch (e) {
        console.log('oEmbed Error:', e.message);
    }

    try {
        console.log('Testing FastDL...');
        const f = await testFastDl(url);
        console.log('FastDL Result:', JSON.stringify(f).substring(0, 100));
    } catch (e) {
        console.log('FastDL Error:', e.message);
    }

    try {
        console.log('Testing SnapSave...');
        const s = await testSnapsave(url);
        console.log('SnapSave Result:', typeof s === 'string' ? s.substring(0, 100) : JSON.stringify(s).substring(0, 100));
    } catch (e) {
        console.log('SnapSave Error:', e.message);
    }
}

run();
