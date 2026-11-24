<h1 align="center">arthistory</h1>

<p align="center">
   <a href="https://github.com/brandongregoryscott/arthistory/actions">
        <img src="https://github.com/brandongregoryscott/arthistory/actions/workflows/ci.generated.yml/badge.svg">
    </a>
    <a href="https://github.com/prettier/prettier">
        <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square"/>
    </a>
    <a href="http://www.typescriptlang.org/">
        <img alt="TypeScript" src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"/>
    </a>
</p>

Web application for viewing historical Spotify artist data.

## Quick Start

The app can be accessed at [arthistory.brandonscott.me](https://arthistory.brandonscott.me).

## About

The Spotify API _used_ to provide follower count and a popularity score for an artist, and never provided historical data. I always wanted to track how my favorite artists were growing over time, so I built this application and maybe you'll find it useful too.

## How it works

The Express API serves stored artist metadata and weekly snapshots from a PocketBase sidecar.

Not every artist on Spotify is tracked, but new artists can be requested through the web UI.

## Development

### Setup

Ensure you have `nvm` installed to easily manage Node versions, and Docker Desktop to run `docker compose` for the PocketBase sidecar. The web app and API just run dev servers locally.

```sh
nvm use
npm ci

cp apps/api/.env.example .env
cp apps/web/.env.example apps/web/.env
```

Set `POCKETBASE_SUPERUSER_PASSWORD` in `.env`, then copy the same configuration
for the local API and start the app:

```sh
cp .env apps/api/.env

docker compose up -d --build pocketbase
npm run build
npm run dev
```

Open [localhost:6767](http://localhost:6767) for the app or [localhost:6769/_/](http://localhost:6769/_/) for the PocketBase dashboard. Sign in to the dashboard with the superuser credentials from `.env`. Migrations run automatically on container startup, and data persists in a Docker volume.

## Issues

If you find a bug, feel free to [open up an issue](https://github.com/brandongregoryscott/arthistory/issues/new) and try to describe it in detail with reproduction steps if possible.

If you would like to see a feature, and it isn't [already documented](https://github.com/brandongregoryscott/arthistory/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement), feel free to open up a new issue and describe the desired behavior.
