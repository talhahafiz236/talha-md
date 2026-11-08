const axios = require('axios');

async function testCandidateApis() {
  const ytUrl = 'https://www.youtube.com/watch?v=kJQP7kiw5Fk';
  const igUrl = 'https://www.instagram.com/reel/C8r_BqSIoWq/';
  const ttUrl = 'https://vt.tiktok.com/ZSjXgL7rN/';

  console.log('--- Testing BK9 ---');
  try {
    const res = await axios.get('https://bk9.fun/download/tiktok?url=' + encodeURIComponent('https://www.tiktok.com/@mrbeast/video/7339401777097985322'), { timeout: 8000 });
    console.log('BK9 TikTok:', res.data?.status ? 'WORKING OK' : 'FAILED: ' + JSON.stringify(res.data));
  } catch(e) { console.log('BK9 TikTok Err:', e.message); }

  try {
    const res = await axios.get('https://bk9.fun/download/instagram?url=' + encodeURIComponent('https://www.instagram.com/p/C6_4p_vI5-y/'), { timeout: 8000 });
    console.log('BK9 Instagram:', res.data?.status ? 'WORKING OK' : 'FAILED: ' + JSON.stringify(res.data));
  } catch(e) { console.log('BK9 Instagram Err:', e.message); }

  try {
    const res = await axios.get('https://bk9.fun/download/youtube?url=' + encodeURIComponent(ytUrl), { timeout: 8000 });
    console.log('BK9 YouTube:', res.data?.status ? 'WORKING OK' : 'FAILED: ' + JSON.stringify(res.data));
  } catch(e) { console.log('BK9 YouTube Err:', e.message); }

  console.log('--- Testing Delirius API ---');
  try {
    const res = await axios.get('https://delirius-apiofc.vercel.app/download/tiktok?url=' + encodeURIComponent('https://www.tiktok.com/@mrbeast/video/7339401777097985322'), { timeout: 8000 });
    console.log('Delirius TikTok:', res.data?.status ? 'WORKING OK' : 'FAILED');
  } catch(e) { console.log('Delirius TikTok Err:', e.message); }

  try {
    const res = await axios.get('https://delirius-apiofc.vercel.app/download/instagram?url=' + encodeURIComponent('https://www.instagram.com/p/C6_4p_vI5-y/'), { timeout: 8000 });
    console.log('Delirius Instagram:', res.data?.status ? 'WORKING OK' : 'FAILED');
  } catch(e) { console.log('Delirius Instagram Err:', e.message); }

  console.log('--- Testing Gifted API ---');
  try {
    const res = await axios.get('https://api.giftedtech.web.id/api/download/tiktok?apikey=gifted-md&url=' + encodeURIComponent('https://www.tiktok.com/@mrbeast/video/7339401777097985322'), { timeout: 8000 });
    console.log('Gifted TikTok:', res.data?.success ? 'WORKING OK' : 'FAILED: ' + JSON.stringify(res.data));
  } catch(e) { console.log('Gifted TikTok Err:', e.message); }

  try {
    const res = await axios.get('https://api.giftedtech.web.id/api/download/ytmp4?apikey=gifted-md&url=' + encodeURIComponent(ytUrl), { timeout: 8000 });
    console.log('Gifted YTMP4:', res.data?.success ? 'WORKING OK' : 'FAILED: ' + JSON.stringify(res.data));
  } catch(e) { console.log('Gifted YTMP4 Err:', e.message); }
}

testCandidateApis();
