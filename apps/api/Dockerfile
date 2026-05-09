FROM node:20-slim AS base
RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/provider-bulgaria/package.json packages/provider-bulgaria/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/api/ apps/api/

RUN pnpm turbo build --filter=@vignette/api

EXPOSE 4001
ENV NODE_ENV=production
CMD ["node", "apps/api/dist/index.js"]
