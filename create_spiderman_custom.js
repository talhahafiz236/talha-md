const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createSpiderManBanner() {
  const inputImage = 'C:/Users/Qc/.gemini/antigravity/brain/06c6fabb-b0c1-4683-bafa-1f7804254d3b/.user_uploaded/media_1793816467723_9cb98ed4.jpg';
  const artifactDir = 'C:/Users/Qc/.gemini/antigravity/brain/06c6fabb-b0c1-4683-bafa-1f7804254d3b';
  const publicDir = path.join(__dirname, 'public');

  // SVG overlay on top of 1024x612
  // We place TALHA-MD on the left side where the space is dark & clear
  const svgOverlay = Buffer.from(`
    <svg width="1024" height="612" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradients -->
        <linearGradient id="chromeSilver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="35%" stop-color="#F8FAFC" />
          <stop offset="70%" stop-color="#CBD5E1" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>

        <linearGradient id="spiderRed" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#FF334B" />
          <stop offset="50%" stop-color="#E61C38" />
          <stop offset="100%" stop-color="#990B20" />
        </linearGradient>

        <!-- Red Neon Glow Filter -->
        <filter id="heroGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <!-- Soft vignette on left corner to make text 100% pop -->
        <radialGradient id="leftVignette" cx="20%" cy="30%" r="55%">
          <stop offset="0%" stop-color="#000000" stop-opacity="0.85" />
          <stop offset="70%" stop-color="#000000" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Soft dark backdrop on left area -->
      <rect x="0" y="0" width="380" height="340" fill="url(#leftVignette)" />

      <!-- High-Tech Spider Accent Top Line -->
      <line x1="45" y1="95" x2="280" y2="95" stroke="#E61C38" stroke-width="2.5" opacity="0.85" />
      <polygon points="45,92 53,95 45,98" fill="#E61C38" />
      <circle cx="280" cy="95" r="3.5" fill="#E61C38" />

      <!-- Badge -->
      <rect x="45" y="112" width="135" height="22" rx="3" fill="#0F172A" stroke="#E61C38" stroke-width="1.2" opacity="0.9" />
      <text x="112" y="127"
        font-family="Arial, Helvetica, sans-serif"
        font-size="10"
        font-weight="800"
        letter-spacing="2"
        text-anchor="middle"
        fill="#FFFFFF">HERO EDITION</text>

      <!-- Main Title: TALHA-MD -->
      <!-- Red Glow Background -->
      <text x="45" y="195"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="62"
        font-weight="900"
        letter-spacing="5"
        fill="none"
        stroke="#E61C38"
        stroke-width="10"
        filter="url(#heroGlow)"
        opacity="0.9">TALHA-MD</text>

      <!-- Black Deep Shadow -->
      <text x="48" y="198"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="62"
        font-weight="900"
        letter-spacing="5"
        fill="#000000"
        opacity="0.95">TALHA-MD</text>

      <!-- Main Chrome Metallic Text -->
      <text x="45" y="195"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="62"
        font-weight="900"
        letter-spacing="5"
        fill="url(#chromeSilver)">TALHA-MD</text>

      <!-- Subtitle -->
      <text x="47" y="228"
        font-family="Arial, Helvetica, sans-serif"
        font-size="13"
        font-weight="800"
        letter-spacing="3"
        fill="#E61C38">OFFICIAL WHATSAPP BOT</text>

      <text x="47" y="250"
        font-family="Arial, Helvetica, sans-serif"
        font-size="11"
        font-weight="700"
        letter-spacing="2"
        fill="#94A3B8">MASTER: TALHA SHEIKH</text>

      <line x1="45" y1="265" x2="260" y2="265" stroke="#334155" stroke-width="1" opacity="0.7" />
    </svg>
  `);

  const outputBanner = path.join(publicDir, 'banner.png');
  const outputJpg = path.join(publicDir, 'talha_md_hero.jpg');
  const artifactBanner = path.join(artifactDir, 'talha_md_hero.jpg');

  await sharp(inputImage)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toFile(outputJpg);

  // Also write as png to banner.png
  await sharp(outputJpg).toFile(outputBanner);

  // Copy to artifact directory
  fs.copyFileSync(outputJpg, artifactBanner);

  console.log('✅ Spider-Man Banner Created with TALHA-MD on the side (Zero Gemini)!');
}

createSpiderManBanner().catch(console.error);
