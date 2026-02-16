# Build stage
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime stage
FROM node:20-slim

# Install Python 3, FFmpeg, and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for video generation
RUN pip3 install --no-cache-dir \
    moviepy \
    gTTS \
    Pillow \
    --break-system-packages

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
# Copy Python scripts
COPY scripts/generate-video.py ./scripts/generate-video.py
# Default envs can be overridden at deploy time
ENV NODE_ENV=production
ENV RUN_ONCE=true
CMD ["node", "dist/cli.js"]
