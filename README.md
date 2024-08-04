<h1 align="center">arthistory</h1>

<p align="center">
   <a href="https://github.com/brandongregoryscott/arthistory/actions">
        <img src="https://github.com/brandongregoryscott/arthistory/actions/workflows/build.yml/badge.svg">
    </a>
    <a href="https://github.com/prettier/prettier">
        <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square"/>
    </a>
    <a href="http://www.typescriptlang.org/">
        <img alt="TypeScript" src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"/>
    </a>
    <a href="http://commitizen.github.io/cz-cli/">
        <img alt="Commitizen friendly" src="https://img.shields.io/badge/commitizen-friendly-brightgreen.svg"/>
    </a>
</p>

Web application for viewing historical Spotify artist data.

## Quick Start

The app can be accessed at [arthistory.brandonscott.me](https://arthistory.brandonscott.me).

## About

The Spotify API provides the current follower count and a popularity score for an artist, but does not provide any historical data. I always wanted to track how my favorite artists were growing over time, so maybe you'll find this app useful too.

## How it works

Artist data is synced and pushed everyday to the [spotify-data](https://github.com/brandongregoryscott/spotify-data) repo. To easily query the data over time, a SQLite database is built by iterating through the git history and pushed up to S3, which is pulled down and bundled with the API server.

Not every artist on Spotify is tracked, but new artists can be requested through the web UI or by opening up a pull request to the [spotify-data](https://github.com/brandongregoryscott/spotify-data) repo.

## Development

### Database

The API requires at least a partial SQLite database to query. See the [spotify-data](https://github.com/brandongregoryscott/spotify-data/tree/main?tab=readme-ov-file#building-a-sqlite-database) repo for instructions on how to build a SQLite database to use.

### Spotify API keys

The search endpoint in the API hits the Spotify API, so you'll need API keys to search for artists. See the [Spotify API](https://developer.spotify.com/documentation/web-api/tutorials/getting-started) documentation on signing up for developer access.

### Setup

```sh
# Edit the environment file to add your Spotify API keys and path to the SQLite database file
cp apps/api/.env.example apps/api/.env

# The environment file for the web app probably doesn't need to be changed.
cp apps/web/.env.example apps/web/.env

# Install packages (ensure you are using Node v20+, run `nvm use` if you have `nvm` installed.)
npm i

# Run a build (This ensures sqlite is built and placed in the right location in the monorepo)
npm run build

# Run the development servers for the web app and API
npm run dev

# Now, open http://localhost:3000 in your browser to view the app.
```

## Issues

If you find a bug, feel free to [open up an issue](https://github.com/brandongregoryscott/arthistory/issues/new) and try to describe it in detail with reproduction steps if possible.

If you would like to see a feature, and it isn't [already documented](https://github.com/brandongregoryscott/arthistory/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement), feel free to open up a new issue and describe the desired behavior.
