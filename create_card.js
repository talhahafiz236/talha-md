const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createPoster() {
  const inputImage = 'C:/Users/Qc/.gemini/antigravity/brain/95593126-1164-41dc-89d0-fb2039cc244e/nobita_doraemon_gangster_1792302660073.jpg';

  // SVG Overlay that completely and cleanly erases the old text and displays TALHA MD in 3D glowing glory
  const svgOverlay = Buffer.from(`
    <svg width="1376" height="768" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- 100% Opaque solid mask over the old text region -->
        <linearGradient id="topMask" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#070c18" stop-opacity="1.0" />
          <stop offset="65%" stop-color="#09101f" stop-opacity="1.0" />
          <stop offset="85%" stop-color="#070c18" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </linearGradient>

        <!-- Gold metallic 3D gradient for TALHA MD -->
        <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="20%" stop-color="#FEF08A" />
          <stop offset="45%" stop-color="#FBBF24" />
          <stop offset="70%" stop-color="#F59E0B" />
          <stop offset="90%" stop-color="#B45309" />
          <stop offset="100%" stop-color="#78350F" />
        </linearGradient>

        <!-- Electric Cyan Glow Filter -->
        <filter id="cyanGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Mask to 100% cleanly cover the old Japanese text & date -->
      <rect x="0" y="0" width="1376" height="200" fill="url(#topMask)" />

      <!-- High-tech cyan neon bar behind title -->
      <line x1="288" y1="172" x2="1088" y2="172" stroke="#00F0FF" stroke-width="2" opacity="0.6" />
      <circle cx="688" cy="172" r="4" fill="#00F0FF" />

      <!-- Outer Cyan Glow text -->
      <text x="688" y="118" 
        font-family="Arial Black, Impact, sans-serif" 
        font-size="94" 
        font-weight="900" 
        letter-spacing="12" 
        text-anchor="middle" 
        fill="none" 
        stroke="#00F0FF" 
        stroke-width="14" 
        filter="url(#cyanGlow)" 
        opacity="0.95">TALHA MD</text>

      <!-- Black drop shadow -->
      <text x="693" y="123" 
        font-family="Arial Black, Impact, sans-serif" 
        font-size="94" 
        font-weight="900" 
        letter-spacing="12" 
        text-anchor="middle" 
        fill="#000000" 
        opacity="0.95">TALHA MD</text>

      <!-- Main Metallic Gold Text -->
      <text x="688" y="118" 
        font-family="Arial Black, Impact, sans-serif" 
        font-size="94" 
        font-weight="900" 
        letter-spacing="12" 
        text-anchor="middle" 
        fill="url(#goldGrad)">TALHA MD</text>

      <!-- Subtitle Badge -->
      <text x="688" y="160" 
        font-family="Arial, sans-serif" 
        font-size="19" 
        font-weight="800" 
        letter-spacing="7" 
        text-anchor="middle" 
        fill="#38BDF8">GANGSTER NOBITA &amp; DORAEMON EDITION</text>
    </svg>
  `);

  const output1 = path.join(__dirname, 'public', 'nobita_doraemon_talhamd_card.jpg');
  const output2 = 'C:/Users/Qc/.gemini/antigravity/brain/95593126-1164-41dc-89d0-fb2039cc244e/nobita_doraemon_talhamd_card.jpg';

  await sharp(inputImage)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toFile(output1);

  fs.copyFileSync(output1, output2);
  fs.copyFileSync(output1, path.join(__dirname, 'public', 'nobita_gangster.png'));
  fs.copyFileSync(output1, path.join(__dirname, 'public', 'nobita_doraemon_gangster.png'));

  console.log('✅ Created pristine official card successfully with 100% clean TALHA MD branding!');
}

createPoster().catch(err => console.error('Error:', err));
