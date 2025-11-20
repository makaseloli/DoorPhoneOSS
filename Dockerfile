# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/root/.local/share/pnpm" \
    PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM base AS build

ENV DATABASE_URL="file:./dev.db"

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/package.json /app/package.json
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=deps /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY . .

RUN pnpm prisma generate \
    && pnpm prisma db push --skip-generate \
    && pnpm build

FROM base AS runner

ENV NODE_ENV=production \
    PORT=34567 \
    NITRO_PORT=34567 \
    NITRO_HOST=0.0.0.0 \
    DATABASE_URL="file:/app/data/dev.db"

WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/.output /app/.output
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma

RUN mkdir -p /app/data

EXPOSE 34567

CMD ["node", ".output/server/index.mjs"]
