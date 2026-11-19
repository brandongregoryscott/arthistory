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

### PocketBase sidecar

The API currently uses the legacy database. To start the optional sidecar, set the
server-side PocketBase credentials in the root .env (see apps/api/.env.example):

```sh
docker compose --profile pocketbase up -d --build pocketbase
```

The owner dashboard is at /_/ on the PocketBase origin. To start its tunnel:

```sh
docker compose --profile pocketbase-tunnel up -d pocketbase-tunnel
```

The existing npm test command includes schema/rollback checks when
POCKETBASE_TEST_BINARY points to the pinned PocketBase executable; otherwise it
explicitly skips that integration test.

### Preparing legacy data

Download the latest merged legacy backup from R2, then inspect and prepare that
single SQLite file with explicit timestamp units:

```sh
npm run prepare-import -- --source ./backup.db --timestamp-unit seconds --inventory
npm run prepare-import -- --source ./backup.db --timestamp-unit seconds --output ./prepared-data
```

The tool opens the backup read-only and checks its integrity, row/artist counts
and timestamp range. Verify that inventory before importing. SQLite sorting uses
temporary disk space; allow free disk of several times the input size.
JavaScript holds one row at a time.

The export retains artists whose latest known non-null follower count meets the
cutoff, preserving their earlier weekly history. Use --cutoff to change the
threshold or repeat --keep-id to retain specific artists. Weekly snapshots use
the latest complete capture, including null values. Ties prefer the larger
rowid within the backup.

The new output directory contains artists.jsonl, snapshots.jsonl,
excluded-artists.jsonl and report.json. IDs are deterministic; imported artists
have syncing disabled. Names remain unresolved and are counted in the report.
Existing output directories are rejected. These files are preparation artifacts;
the command does not load PocketBase or change any original database.

### Loading prepared data

Configure the server-side PocketBase connection in the root .env, then load a
prepared export into an isolated migration target:

```sh
npm run import-data -- --input ./prepared-data
```

The loader validates all records, relationships and report counts into a private
temporary spool before contacting PocketBase. Allow temporary disk space for one
additional copy of the prepared records. Writes use bounded, sequential batches
through the built-in records API.

Rerun the same export after interruption. Matching rows and newer captures are
skipped; existing artist names, aliases and enrollment are preserved. Conflicts
stop the load. Existing artists must have the deterministic IDs from preparation;
a different ID for the same Spotify artist requires reconciliation before loading.
The loader does not update snapshots with conflicting values or enable collection.

The regular test command checks the SDK request contract with mocked fetch
responses. With POCKETBASE_TEST_BINARY configured, it also loads prepared fixture
records through the real PocketBase model layer and reports table/index storage
and native backup size/time. Live HTTP loading, production-scale measurements and
a complete restore still need verification before cutover.

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
