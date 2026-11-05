FROM node:20-bullseye-slim

# Install system dependencies (ffmpeg, python3 for yt-dlp, curl, git)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install npm dependencies
RUN npm ci --omit=dev || npm install --production

# Copy application source
COPY . .

# Ensure write permissions for auth_info, temp, and data directories
RUN mkdir -p auth_info temp data public \
    && chmod -R 777 /app

# Expose server port (7860 for Hugging Face Spaces, 3005 for local/Render)
EXPOSE 7860 3005

ENV PORT=7860

# Start TALHA-MD
CMD ["npm", "start"]
