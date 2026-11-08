const axios = require('axios');

async function testAll() {
  console.log('Testing APIs...');

  // 1. TikTok
  try {
    const url = 'https://www.tiktok.com/@tiktok/video/7106594312292453678';
    const res = await axios.get('https://tikwm.com/api/?url=' + encodeURIComponent(url), { timeout: 8000 });
    console.log('1. TikTok TikWM:', res.data?.data?.play ? 'WORKING OK' : 'FAILED: ' + JSON.stringify(res.data));
  } catch (e) {
    console.log('1. TikTok Exception:', e.message);
  }

  // 2. Cobalt
  try {
    const res = await axios.post('https://api.cobalt.tools/', { url: 'https://youtube.com/watch?v=kJQP7kiw5Fk' }, { timeout: 6000 });
    console.log('2. Cobalt API:', res.status);
  } catch (e) {
    console.log('2. Cobalt API: FAILED (Expected, blocked by Cloudflare):', e.message);
  }

  // 3. YouTube Search
  try {
    const yts = require('yt-search');
    const r = await yts('Alan Walker Faded');
    console.log('3. YouTube Search:', r.videos?.length ? 'WORKING OK - ' + r.videos[0].title : 'FAILED');
  } catch (e) {
    console.log('3. YouTube Search Exception:', e.message);
  }

  // 4. YouTube MP3 / MP4 API fallback
  try {
    const res = await axios.get('https://api.siputzx.my.id/api/d/ytmp3?url=https://www.youtube.com/watch?v=kJQP7kiw5Fk', { timeout: 10000 });
    console.log('4. YTMP3 API siputzx:', res.data?.status ? 'WORKING OK' : 'Result: ' + JSON.stringify(res.data).slice(0, 100));
  } catch (e) {
    console.log('4. YTMP3 siputzx Exception:', e.message);
  }

  // 5. Instagram
  try {
    const res = await axios.get('https://api.siputzx.my.id/api/d/igdl?url=https://www.instagram.com/p/C6_4p_vI5-y/', { timeout: 10000 });
    console.log('5. Instagram API siputzx:', res.data?.status ? 'WORKING OK' : 'Result: ' + JSON.stringify(res.data).slice(0, 100));
  } catch (e) {
    console.log('5. Instagram siputzx Exception:', e.message);
  }

  // 6. Facebook
  try {
    const res = await axios.get('https://api.siputzx.my.id/api/d/facebook?url=https://www.facebook.com/watch?v=10153231379946729', { timeout: 10000 });
    console.log('6. Facebook API siputzx:', res.data?.status ? 'WORKING OK' : 'Result: ' + JSON.stringify(res.data).slice(0, 100));
  } catch (e) {
    console.log('6. Facebook siputzx Exception:', e.message);
  }

  // 7. Pinterest
  try {
    const res = await axios.get('https://api.siputzx.my.id/api/s/pinterest?query=spiderman', { timeout: 10000 });
    console.log('7. Pinterest API siputzx:', res.data?.status ? 'WORKING OK' : 'Result: ' + JSON.stringify(res.data).slice(0, 100));
  } catch (e) {
    console.log('7. Pinterest siputzx Exception:', e.message);
  }
}

testAll();
