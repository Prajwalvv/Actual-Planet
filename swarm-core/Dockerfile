# ═══════════════════════════════════════════════
# SWARM INTEL — Cloud Run Container
# Runs the Express API + Swarm Engine + Puppeteer
# ═══════════════════════════════════════════════

FROM node:20-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY models/ ./models/
COPY public/ ./public/

# Copy Firebase service account (mounted as secret in Cloud Run)
# In production, use Cloud Run secrets instead of bundling the key
# COPY rylvo-vid-firebase-adminsdk-*.json ./

# Build TypeScript
RUN npx tsc

# Cloud Run uses PORT env variable
ENV PORT=8080
ENV SWARM_API_PORT=8080

EXPOSE 8080

# Start the API server
CMD ["node", "dist/swarm-api.js"]
