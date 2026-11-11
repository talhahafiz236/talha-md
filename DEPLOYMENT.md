# 🚀 TALHA-MD 24/7 Cloud Deployment Guide

Aapka WhatsApp bot **TALHA-MD** ab 100% ready hai! 
Apne laptop ko band karne ke baad bhi bot ko 24/7 chalane ke liye aap ise **Render**, **Koyeb**, ya **VPS** par free host kar sakte hain.

---

## 🔑 Sab Se Ahem Cheez (SESSION_ID)
Aapke WhatsApp DM mein aapko aapka permanent **SESSION_ID** mil chuka hai jo is tarah shuru hota hai:
```text
TALHA-MD~eyJub2lzZUtleSI...
```
*(Yeh code kisi ke sath share na karein, yeh aapke bot ki login key hai).*

---

## 🌐 Method 1: Render.com Par 24/7 Deploy Karna (Recommended)

1. **GitHub Par Code Upload Karein:**
   * [GitHub.com](https://github.com) par jayein aur ek New Repository banayein (e.g. `talha-md`).
   * Is project ke tamaam files ko GitHub par push / upload karein.
   *(Note: `session/` folder, `.env`, aur `config.env` automatically `.gitignore` hain, is liye aapka personal data safe rahega).*

2. **Render Account Banayein:**
   * [Render.com](https://render.com) par jayein aur free sign-up karein.

3. **New Web Service Create Karein:**
   * Dashboard par **New +** button par click karein aur **Web Service** select karein.
   * Apni GitHub repository (`talha-md`) ko select karein.

4. **Service Settings:**
   * **Name:** `talha-md`
   * **Language / Environment:** `Docker` *(Recommended: Humare Dockerfile mein ffmpeg aur yt-dlp pehle se installed hain)*
   * **Region:** Frankfurt ya Singapore
   * **Plan:** Free

5. **Environment Variables Add Karein:**
   Niche **Environment Variables** section mein jayein aur yeh variables add karein:
   | Key | Value |
   |---|---|
   | `SESSION_ID` | (Aapka WhatsApp DM se copy kiya hua `TALHA-MD~...` code) |
   | `OWNER_NUMBER` | `923426767199` |
   | `BOT_NAME` | `TALHA-MD` |
   | `MODE` | `both` |
   | `OPENWEATHER_API_KEY` | Optional: weather commands |
   | `VIRUSTOTAL_API_KEY` | Optional: URL scan commands |
   | `AUDD_API_KEY` | Optional: Shazam/song ID commands |
   | `OCR_SPACE_API_KEY` | Optional: OCR commands |

6. **Deploy Par Click Karein:**
   * **Create Web Service** par click karein!
   * 2 se 3 minute mein Render bot ko build aur live kar dega.
   * Aapka bot 24/7 cloud par online ho jayega!

---

## 🌐 Method 2: Koyeb.com Par Deploy Karna (Fast & Free)

1. [Koyeb.com](https://koyeb.com) par free account banayein.
2. **Create App** par click karein aur **GitHub** select karein.
3. Apni repo select karein.
4. Builder: **Dockerfile** select karein.
5. Environment variable mein `SESSION_ID` paste karein.
6. **Deploy** dabayein — Koyeb bot ko foran live kar dega.

---

## 🖥️ Method 3: VPS / Ubuntu Server (PM2)

Agar aapke paas koi Linux VPS hai:
```bash
# 1. Clone repository
git clone <your-repo-url>
cd talha-md

# 2. Dependencies install karein
npm install
sudo apt-get install -y ffmpeg python3
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

# 3. PM2 ke sath 24/7 background run karein
npm install -g pm2
pm2 start talha.js --name "talha-md"
pm2 save
pm2 startup
```

---

## 💡 Bot Ka Status Check Kaise Karein?
Jab bot cloud par deploy ho jaye, to kisi bhi chat mein:
> `.alive` ya `.ping`  
likhein. Bot foran uptime, RAM aur latency ka live card send kar dega!


### Web pairing portal security

The `/qr` page and `/api/pair` endpoint require HTTP Basic authentication. Set `PAIRING_PORTAL_PASSWORD` in Render to a unique random value of at least 24 characters; use username `owner` in the browser prompt. If the variable is missing or shorter than 24 characters, web pairing stays disabled. WhatsApp chat pairing commands are not affected.


### Uptime monitoring

Use `/ready` as the UptimeRobot HTTP monitor URL. It returns HTTP 200 only when WhatsApp is connected and plugins have loaded; otherwise it returns HTTP 503 so the monitor reports the bot as unavailable. Keep `/ping` for the app's self-ping only; it always responds with `pong` and does not prove WhatsApp connectivity. The `/health` response includes connection/plugin counts for read-only diagnosis.
