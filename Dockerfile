# syntax = docker/dockerfile:1

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"
ENV PORT="3000"

# Build stage to compile native/git dependencies cleanly
FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git node-gyp pkg-config python-is-python3 ca-certificates && \
    git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git://github.com/"

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Final runtime image
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ffmpeg python3 curl ca-certificates && \
    curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    printf '%s\n' '--js-runtimes node' > /etc/yt-dlp.conf && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

COPY --from=build /app /app

EXPOSE 3000
CMD [ "npm", "run", "start" ]
