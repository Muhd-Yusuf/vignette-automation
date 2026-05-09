FROM node:20-slim AS base

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libwayland-client0 \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/provider-bulgaria/package.json packages/provider-bulgaria/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --frozen-lockfile

# Install Playwright Chromium
RUN npx playwright install chromium

COPY packages/ packages/
COPY apps/worker/ apps/worker/

RUN pnpm turbo build --filter=@vignette/worker

ENV NODE_ENV=production
ENV BROWSER_HEADLESS=true
CMD ["node", "apps/worker/dist/index.js"]
