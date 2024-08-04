## Base
FROM node:20-alpine3.19 AS base
ARG AWS_ACCESS_KEY_ID
ENV AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
ARG AWS_SECRET_ACCESS_KEY
ENV AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
WORKDIR /app
RUN apk add aws-cli

# Download the sqlite db from s3
RUN aws s3 cp s3://arthistory-spotify-data/$(aws s3 ls s3://arthistory-spotify-data | sort | tail -n 1 | awk '{print $4}') _spotify-data.db

## Builder
FROM base AS builder
RUN apk update
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install turbo@2 --global

COPY . .

# Generate a partial monorepo with a pruned lockfile for a target workspace.
# Assuming "api" is the name entered in the project's package.json: { name: "api" }
RUN npx turbo prune api --docker

## Installer
FROM base AS installer
RUN apk update
RUN apk add python3 make gcc g++ libc-dev
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm install

# Build the project
COPY --from=builder /app/out/full/ .
RUN npx turbo run build --filter=api...

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
COPY --from=base /app/_spotify-data.db ./_spotify-data.db

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

