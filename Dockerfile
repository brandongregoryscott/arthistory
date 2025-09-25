## Base
FROM node:24.8-alpine3.21 AS base

## Builder
FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install turbo@2 --global

COPY . .

# Generate a partial monorepo with a pruned lockfile for a target workspace.
# Assuming "api" is the name entered in the project's package.json: { name: "api" }
RUN npx turbo prune api scripts --docker

## Installer
FROM base AS installer

ARG AWS_ACCESS_KEY_ID
ENV AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
ARG AWS_SECRET_ACCESS_KEY
ENV AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
ARG AWS_S3_ENDPOINT
ENV AWS_S3_ENDPOINT=${AWS_S3_ENDPOINT}

RUN apk update
RUN apk add python3 py3-setuptools make gcc g++ libc-dev
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm install

# Build the project
COPY --from=builder /app/out/full/ .
RUN npx turbo run build --filter=api...

# Download the partial sqlite dbs from s3 and merge them
RUN npm run download-dbs && npm run merge-dbs

## Runner
FROM base AS runner
WORKDIR /app

RUN npm install pm2 --global

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs

COPY --from=builder /app/process.yml ./process.yml
COPY --from=builder /app/package.json ./package.json
COPY --from=installer /app/apps/api/dist ./dist
COPY --from=installer /app/apps/api/build ./build
COPY --from=installer /app/merged-spotify-data.db ./_spotify-data.db

ARG PORT=3001
ENV PORT=${PORT}

ARG CLIENT_ID
ENV CLIENT_ID=${CLIENT_ID}

ARG CLIENT_SECRET
ENV CLIENT_SECRET=${CLIENT_SECRET}

ARG DATABASE_PATH=/app/_spotify-data.db
ENV DATABASE_PATH=${DATABASE_PATH}

ARG POSTHOG_KEY
ENV POSTHOG_KEY=${POSTHOG_KEY}

ENV NODE_ENV=production

CMD pm2 start process.yml && tail -f /dev/null

