'use strict';
const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('querystring');

async function testIndown(url) {
    try {
        const r1 = await axios.get('https://indown.io/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        const $ = cheerio.load(r1.data);
        const formAction = $('form').attr('action') || 'https://indown.io/download';
        const token = $('input[name="_token"]').val() || '';
        const cookies = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

        console.log('indown formAction:', formAction, 'hasToken:', !!token);

        const r2 = await axios.post(formAction, qs.stringify({
            referer: 'https://indown.io/',
            locale: 'en',
            _token: token,
            link: url
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cookie': cookies,
                'Referer': 'https://indown.io/'
            },
            timeout: 15000
        });

        const $2 = cheerio.load(r2.data);
        const downloadLinks = [];
        $2('a[href*=".mp4"], a[href*="cdninstagram"], a:contains("Download")').each((i, el) => {
            const href = $2(el).attr('href');
            if (href && (href.startsWith('http') || href.includes('.mp4'))) {
                downloadLinks.push(href);
            }
        });

        console.log('Indown links found:', downloadLinks.length, downloadLinks.slice(0, 2));
        return downloadLinks;
    } catch (e) {
        console.log('Indown error:', e.message);
        return null;
    }
}

testIndown('https://www.instagram.com/reel/C8qA_eQpG_z/');
