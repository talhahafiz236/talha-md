'use strict';

async function testLocalScrapers() {
    console.log('Testing local scrapers...');

    // 1. Instagram
    try {
        const instagramGetUrl = require('instagram-url-direct');
        console.log('Testing instagram-url-direct...');
        const igRes = await instagramGetUrl('https://www.instagram.com/reel/C8qA_eQpG_z/');
        console.log('instagram-url-direct success:', !!igRes?.url_list?.length);
    } catch (e) {
        console.log('instagram-url-direct error:', e.message);
    }

    try {
        const fg = require('fg-ig');
        console.log('Testing fg-ig...');
        const fgRes = await fg('https://www.instagram.com/reel/C8qA_eQpG_z/');
        console.log('fg-ig success:', !!fgRes);
    } catch (e) {
        console.log('fg-ig error:', e.message);
    }

    // 2. Facebook
    try {
        const getFBInfo = require('fb-downloader-scrapper');
        console.log('Testing fb-downloader-scrapper...');
        const fbRes = await getFBInfo('https://www.facebook.com/watch/?v=10153231379946729');
        console.log('fb-downloader-scrapper success:', !!fbRes?.sd || !!fbRes?.hd);
    } catch (e) {
        console.log('fb-downloader-scrapper error:', e.message);
    }

    // 3. TikTok scraper
    try {
        const { tiktokdl } = require('@bochilteam/scraper');
        console.log('Testing bochil tiktokdl...');
        const ttRes = await tiktokdl('https://www.tiktok.com/@tiktok/video/7106594312292453678');
        console.log('bochil tiktokdl success:', !!ttRes);
    } catch (e) {
        console.log('bochil tiktokdl error:', e.message);
    }

    // 4. play-dl
    try {
        const play = require('play-dl');
        console.log('Testing play-dl search...');
        const pRes = await play.search('believer imagine dragons', { limit: 1 });
        console.log('play-dl search success:', pRes.length > 0, pRes[0]?.title);
    } catch (e) {
        console.log('play-dl error:', e.message);
    }
}

testLocalScrapers();
