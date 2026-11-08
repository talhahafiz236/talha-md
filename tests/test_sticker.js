'use strict';
const fs = require('fs');
const path = require('path');
const { Sticker } = require('wa-sticker-formatter');

async function testSticker() {
    try {
        console.log('Testing Sticker generation with wa-sticker-formatter...');
        const imgPath = path.join(__dirname, '../assets/talha_md_hero.jpg');
        const imgBuffer = fs.readFileSync(imgPath);

        const sticker = new Sticker(imgBuffer, {
            pack: 'TALHA MD',
            author: 'Talha Sheikh',
            crop: true
        });

        await sticker.build();
        const webpBuffer = await sticker.get();
        console.log('Sticker generated successfully!');
        console.log('WebP buffer length:', webpBuffer.length, 'bytes');
        console.log('Header:', webpBuffer.slice(0, 12).toString('ascii'));
        if (webpBuffer.slice(0, 4).toString('ascii') === 'RIFF' && webpBuffer.slice(8, 12).toString('ascii') === 'WEBP') {
            console.log('VERIFIED: Valid WebP Sticker!');
        } else {
            console.log('WARNING: Not a standard WebP header');
        }
    } catch (e) {
        console.error('Sticker creation failed:', e);
    }
}

testSticker();
