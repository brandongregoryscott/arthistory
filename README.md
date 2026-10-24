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

Artist data is synced and pushed to a SQLite database stored on S3 with scripts from the [scripts](https://github.com/brandongregoryscott/arthistory/blob/main/packages/scripts/src/sync/sync.ts) package in the repo. This database is pulled down and bundled with the API server on build.

Not every artist on Spotify is tracked, but new artists can be requested through the web UI.

## Development

### Database

The API requires a SQLite database to query. A small sample database is included in the repo: [`_spotify-data.db`](./_spotify-data.db).

### Spotify API keys

The `/artists` and `/artists/search` endpoints in the API hit the Spotify API, so you'll need API keys to run them. See the [Spotify API](https://developer.spotify.com/documentation/web-api/tutorials/getting-started) documentation on signing up for developer access.

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

## Debugging and server maintenance

<details>

<summary>Updating the production database
</summary>

Ensure you're using the correct node version

```sh
nvm use
```

Download all of the working snapshots from the `spotify-data` bucket

```sh
npm run download-dbs
```

Merge all of the working snapshots into one file

```sh
npm run merge-dbs
```

Stop the NodeJS process manager running the API instances - if the database file is replaced while it is running, it will crash loop

```sh
pm2 stop arthistory-api
```

Move the merged database file to the production filename

```sh
mv merged-spotify-data.db _spotify-data.db
```

Start the NodeJS process manager running the API instances

```sh
pm2 start arthistory-api
```

</details>

<details>

<summary>Updating API key permissions to include additional buckets (<code>403 Access Denied</code> error when trying to upload objects)
</summary>

- Go to the R2 Overview page: https://dash.cloudflare.com/{accountId}/r2/overview
- Click on the **Manage** button under the **Account Details** > **API Tokens** section on the right to land on
- Land on https://dash.cloudflare.com/{accountId}/r2/api-tokens and choose the API token to add additional buckets/permissions to

</details>

## API route convention

Application routes are unversioned and start at the API origin, without an `/api` prefix. `GET /health` returns HTTP 200 with `{ "ok": true }`. Previous application paths have been removed; deploy the matching API and frontend builds together.

The health check confirms the server responds; it does not probe external services or database availability.

## API metrics

The API serves Prometheus metrics on a separate listener, defaulting to
`http://127.0.0.1:9464/metrics` for native development. Configure `METRICS_HOST` and
`METRICS_PORT` as needed; use distinct ports for APIs running natively together.
The public API port does not expose `/metrics`.

The metrics match Bingo and Noisehaus: `http_request_duration_seconds` histogram
with the same latency buckets and `method`, `route`, and `status_code` labels.
Its `_count` series provides request counts. Route labels contain registered
templates; unmatched and early-rejected requests use `__unmatched__`. Artist IDs,
search queries, tokens, and raw URLs are excluded from metric labels. Health
probes are excluded from request metrics. Node metrics cover memory, CPU, GC,
and event loop lag.

Production uses `docker compose -f docker-compose.yml up --build -d` (or the same
Compose file in Coolify). The API joins the shared external `observability`
network as `arthistory-api-metrics`, listening internally on port 9464 without a
published metrics port. Deploy the [observability stack](https://github.com/brandongregoryscott/observability)
first to create that network.

Local Compose automatically loads `docker-compose.override.yml`, creates an
isolated development network, and skips the tunnel by default. Enable it with
`docker compose --profile tunnels up --build -d` when the tunnel image and SSH
key are available.

After merging and deploying the API, add this entry to
`prometheus/targets/apis.yml` in the observability repository and redeploy
monitoring:

```yaml
- targets: ["arthistory-api-metrics:9464"]
  labels:
      service: arthistory-api
      environment: production
```

The shared dashboard and alert rules then cover Arthistory. Prometheus supplies
the service/environment labels from that target configuration.
