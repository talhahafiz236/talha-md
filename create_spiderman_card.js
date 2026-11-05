const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createSpidermanBanners() {
  const inputImage = 'C:/Users/Qc/.gemini/antigravity/brain/06c6fabb-b0c1-4683-bafa-1f7804254d3b/.user_uploaded/media_1793815589589_b77d35e9.jpg';
  const artifactDir = 'C:/Users/Qc/.gemini/antigravity/brain/06c6fabb-b0c1-4683-bafa-1f7804254d3b';
  const publicDir = path.join(__dirname, 'public');

  // ==========================================
  // 1. VERTICAL POSTER (612 x 1024)
  // Text on top-right / side where dark space is
  // ==========================================
  const svgVertical = Buffer.from(`
    <svg width="612" height="1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradients -->
        <linearGradient id="heroRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FF334B" />
          <stop offset="50%" stop-color="#E61C38" />
          <stop offset="100%" stop-color="#990B20" />
        </linearGradient>

        <linearGradient id="silverChrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="40%" stop-color="#E2E8F0" />
          <stop offset="70%" stop-color="#94A3B8" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>

        <!-- Glow Filters -->
        <filter id="redGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="whiteGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- Soft dark gradient at top right to ensure 100% crystal clear text contrast -->
      <radialGradient id="topRightVignette" cx="80%" cy="15%" r="65%">
        <stop offset="0%" stop-color="#05070D" stop-opacity="0.95" />
        <stop offset="60%" stop-color="#05070D" stop-opacity="0.75" />
        <stop offset="100%" stop-color="#05070D" stop-opacity="0" />
      </radialGradient>
      <rect x="200" y="0" width="412" height="360" fill="url(#topRightVignette)" />

      <!-- Tech Spider Accent Lines -->
      <line x1="320" y1="55" x2="570" y2="55" stroke="#E61C38" stroke-width="2.5" opacity="0.8" />
      <polygon points="320,52 328,55 320,58" fill="#E61C38" />
      <circle cx="570" cy="55" r="3" fill="#E61C38" />

      <!-- Main Title: TALHA-MD -->
      <!-- Red Glow Background -->
      <text x="570" y="115"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="52"
        font-weight="900"
        letter-spacing="5"
        text-anchor="end"
        fill="none"
        stroke="#E61C38"
        stroke-width="8"
        filter="url(#redGlow)"
        opacity="0.9">TALHA-MD</text>

      <!-- Drop Shadow -->
      <text x="572" y="117"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="52"
        font-weight="900"
        letter-spacing="5"
        text-anchor="end"
        fill="#000000"
        opacity="0.95">TALHA-MD</text>

      <!-- Crisp White / Chrome Foreground -->
      <text x="570" y="115"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="52"
        font-weight="900"
        letter-spacing="5"
        text-anchor="end"
        fill="url(#silverChrome)">TALHA-MD</text>

      <!-- Subtitle Badge -->
      <rect x="360" y="132" width="210" height="24" rx="4" fill="#0D1117" stroke="#E61C38" stroke-width="1.2" opacity="0.9" />
      <text x="465" y="148"
        font-family="Arial, Helvetica, sans-serif"
        font-size="10.5"
        font-weight="800"
        letter-spacing="2.5"
        text-anchor="middle"
        fill="#FFFFFF">OFFICIAL HERO BOT</text>

      <line x1="380" y1="172" x2="570" y2="172" stroke="#475569" stroke-width="1" opacity="0.6" />
      
      <!-- Feature Tags -->
      <text x="570" y="190"
        font-family="Arial, Helvetica, sans-serif"
        font-size="9"
        font-weight="700"
        letter-spacing="2"
        text-anchor="end"
        fill="#94A3B8">GEMINI AI • MULTI-DEVICE • 24/7</text>
    </svg>
  `);

  // ==========================================
  // 2. LANDSCAPE HERO BANNER (1280 x 720)
  // Spider-Man on right, TALHA-MD typography on left side
  // ==========================================
  // Resize spiderman to height 720
  const spidermanResized = await sharp(inputImage)
    .resize({ height: 720, fit: 'contain' })
    .toBuffer();

  const svgLandscape = Buffer.from(`
    <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#04060A" />
          <stop offset="45%" stop-color="#070A10" />
          <stop offset="75%" stop-color="#090E17" />
          <stop offset="100%" stop-color="#05070C" />
        </linearGradient>

        <linearGradient id="spiderRedGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FF4D63" />
          <stop offset="40%" stop-color="#E61C38" />
          <stop offset="80%" stop-color="#B91C1C" />
          <stop offset="100%" stop-color="#7F1D1D" />
        </linearGradient>

        <linearGradient id="whiteChromeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="35%" stop-color="#F1F5F9" />
          <stop offset="70%" stop-color="#CBD5E1" />
          <stop offset="100%" stop-color="#64748B" />
        </linearGradient>

        <filter id="neonRed" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <!-- Subtle Spider-Web Pattern Background Grid -->
        <pattern id="webGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 60 M 0 0 L 60 60" fill="none" stroke="#E61C38" stroke-width="0.3" opacity="0.12" />
          <circle cx="30" cy="30" r="15" fill="none" stroke="#38BDF8" stroke-width="0.3" opacity="0.08" />
        </pattern>
      </defs>

      <!-- Background with subtle dark web grid -->
      <rect width="1280" height="720" fill="url(#bgGrad)" />
      <rect width="1280" height="720" fill="url(#webGrid)" />

      <!-- High Tech Accents on Left -->
      <line x1="80" y1="180" x2="580" y2="180" stroke="#E61C38" stroke-width="2" opacity="0.7" />
      <polygon points="80,177 90,180 80,183" fill="#E61C38" />
      <circle cx="580" cy="180" r="3.5" fill="#E61C38" />

      <!-- Top Badge -->
      <rect x="80" y="200" width="170" height="28" rx="4" fill="#131B2E" stroke="#38BDF8" stroke-width="1.2" />
      <text x="165" y="219"
        font-family="Arial, Helvetica, sans-serif"
        font-size="12"
        font-weight="800"
        letter-spacing="3"
        text-anchor="middle"
        fill="#38BDF8">V1.0 HERO EDITION</text>

      <!-- Huge Sleek Title: TALHA-MD -->
      <!-- Red Glow Layer -->
      <text x="80" y="325"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="108"
        font-weight="900"
        letter-spacing="9"
        fill="none"
        stroke="#E61C38"
        stroke-width="14"
        filter="url(#neonRed)"
        opacity="0.9">TALHA-MD</text>

      <!-- Black Shadow -->
      <text x="85" y="330"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="108"
        font-weight="900"
        letter-spacing="9"
        fill="#000000"
        opacity="0.95">TALHA-MD</text>

      <!-- Main Chrome Metallic Text -->
      <text x="80" y="325"
        font-family="Impact, Arial Black, Montserrat, sans-serif"
        font-size="108"
        font-weight="900"
        letter-spacing="9"
        fill="url(#whiteChromeGrad)">TALHA-MD</text>

      <!-- Tagline -->
      <text x="82" y="380"
        font-family="Arial, Helvetica, sans-serif"
        font-size="22"
        font-weight="800"
        letter-spacing="4"
        fill="#E61C38">THE ULTIMATE WHATSAPP HERO BOT</text>

      <text x="82" y="415"
        font-family="Arial, Helvetica, sans-serif"
        font-size="16"
        font-weight="600"
        letter-spacing="1.5"
        fill="#94A3B8">"With great power comes great automation." ⚡🕷️</text>

      <!-- Spec Pillars / Badges -->
      <g transform="translate(80, 470)">
        <!-- Box 1 -->
        <rect x="0" y="0" width="150" height="60" rx="8" fill="#0B0F19" stroke="#1E293B" stroke-width="1.5" />
        <text x="20" y="24" font-family="Arial" font-size="11" font-weight="700" fill="#64748B" letter-spacing="1">MASTER</text>
        <text x="20" y="46" font-family="Arial" font-size="15" font-weight="800" fill="#FFFFFF">Talha Sheikh</text>

        <!-- Box 2 -->
        <rect x="165" y="0" width="150" height="60" rx="8" fill="#0B0F19" stroke="#1E293B" stroke-width="1.5" />
        <text x="185" y="24" font-family="Arial" font-size="11" font-weight="700" fill="#64748B" letter-spacing="1">AI ENGINE</text>
        <text x="185" y="46" font-family="Arial" font-size="15" font-weight="800" fill="#38BDF8">Gemini 3.5</text>

        <!-- Box 3 -->
        <rect x="330" y="0" width="160" height="60" rx="8" fill="#0B0F19" stroke="#1E293B" stroke-width="1.5" />
        <text x="350" y="24" font-family="Arial" font-size="11" font-weight="700" fill="#64748B" letter-spacing="1">SECURITY</text>
        <text x="350" y="46" font-family="Arial" font-size="15" font-weight="800" fill="#22C55E">Anti-Delete Active</text>
      </g>
    </svg>
  `);

  // Generate Vertical Card
  const verticalOut = path.join(publicDir, 'talha_md_vertical.jpg');
  await sharp(inputImage)
    .composite([{ input: svgVertical, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toFile(verticalOut);

  // Generate Landscape Card
  const landscapeOut = path.join(publicDir, 'talha_md_card.jpg');
  const landscapeBannerPng = path.join(publicDir, 'talha_md_banner.png');

  // Composite landscape: background svg + Spiderman placed on right side (x: 850)
  // Left fade mask on Spiderman to blend smoothly into dark background
  const spidermanBlended = await sharp(spidermanResized)
    .ensureAlpha()
    .toBuffer();

  await sharp(svgLandscape)
    .composite([
      { input: spidermanBlended, top: 0, left: 850 }
    ])
    .jpeg({ quality: 95 })
    .toFile(landscapeOut);

  // Copy to all active banner slots
  fs.copyFileSync(landscapeOut, landscapeBannerPng);
  fs.copyFileSync(landscapeOut, path.join(publicDir, 'nobita_gangster.png'));
  fs.copyFileSync(landscapeOut, path.join(publicDir, 'nobita_doraemon_gangster.png'));
  fs.copyFileSync(verticalOut, path.join(publicDir, 'spiderman_hero_poster.jpg'));

  // Also copy to artifact directory for presentation
  fs.copyFileSync(landscapeOut, path.join(artifactDir, 'talha_md_card.jpg'));
  fs.copyFileSync(verticalOut, path.join(artifactDir, 'talha_md_vertical.jpg'));

  console.log('✅ Generated both Vertical and Landscape TALHA-MD Spider-Man Hero Cards!');
}

createSpidermanBanners().catch(console.error);
