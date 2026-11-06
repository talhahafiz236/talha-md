FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Install essential runtime packages (ffmpeg, curl, git, ca-certificates, python3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    git \
    ca-certificates \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp standalone binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install npm dependencies
RUN npm install --omit=dev --no-audit --no-fund

# Copy all application files
COPY . .

# Ensure runtime directories exist with full read/write permissions
RUN mkdir -p auth_info temp data public \
    && chmod -R 777 /app

# Expose port (Render uses dynamic PORT env variable)
EXPOSE 3005 10000

ENV PORT=3005

# Start TALHA-MD
CMD ["node", "server.js"]
