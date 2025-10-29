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

Artist data is synced and pushed to a SQLite database stored on S3 with scripts from the [spotify-data-scripts](https://github.com/brandongregoryscott/spotify-data-scripts) repo. This database is pulled down and bundled with the API server on build.

Not every artist on Spotify is tracked, but new artists can be requested through the web UI.

## Development

### Database

The API requires a SQLite database to query. A small sample database is included in the repo: [`_spotify-data.db`](./_spotify-data.db).

### Spotify API keys

The `/v1/artists` and `/v1/artists/search` endpoints in the API hit the Spotify API, so you'll need API keys to run them. See the [Spotify API](https://developer.spotify.com/documentation/web-api/tutorials/getting-started) documentation on signing up for developer access.

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

## Debugging server setup

Install the service

```sh
sudo systemctl enable /home/brandon/arthistory/arthistory-cron-service.service
```

Start the service

```sh
sudo systemctl start arthistory-cron-service.service
```

Show the service status (active, memory, cpu)

```sh
sudo systemctl status arthistory-cron-service.service
```

List all logs (service-level start/stop/restart events, and stdout/stderr)

```sh
sudo journalctl -xu arthistory-cron-service.service
```

List last 1000 lines from the logs and follows the logs live (service-level start/stop/restart events, and stdout/stderr)
See [manpage: journalctl > PAGER CONTROL OPTIONS](https://www.man7.org/linux/man-pages/man1/journalctl.1.html#PAGER_CONTROL_OPTIONS)

```sh
sudo journalctl -xfeu arthistory-cron-service.service
```

Restart the service daemon & service

```sh
sudo systemctl daemon-reload && sudo systemctl restart arthistory-cron-service.service
```