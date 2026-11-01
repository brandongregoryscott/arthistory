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

## Artist collection worker

The Docker `cron` service collects public artist HTML, uploads partial SQLite databases
hourly at minute 34, and merges/backups them on Sundays at midnight
(`America/New_York`). It needs R2/S3 credentials, but **no Spotify API credentials**.
The web API's existing Spotify credentials are still used for search and metadata.

Each page's base64 `initialState` contains exact followers and monthly listeners.
New snapshots have `popularity = NULL`; historical popularity values are preserved.
Monthly listeners are stored separately as `monthly_listeners`, not displayed as
popularity. The existing followers chart remains the default.

### Deployment and artist selection

Deploy the Compose `cron` service through Coolify on the existing server. Run only
one worker against the persistent `/home/brandon/arthistory/data:/data` mount.
The service initializes/migrates its registry on startup; **all existing IDs default
to disabled**. No artist is automatically enabled from public artist requests.
The API database is not replaced by this service.

The local `/data/artist-ids.db` is authoritative. On a fresh volume the worker restores
it from `artist-ids/artist-ids.db` if present, or initializes an empty registry if
that object does not exist. Existing local registries are never refreshed from the
remote backup. Registry/schema migration is automatic and idempotent.

Run these in the cron container's `/data` working directory (Coolify terminal, or
substitute the actual container name for `cron`):

```sh
# Show enabled IDs and scheduling state; IDs are Spotify IDs, not URLs.
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/artist-sync list

# Enable an existing artist, or add and enable an unknown ID.
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/artist-sync enable 6lcwlkAjBPSKnFBZjjZFJs

# Stop future collection without removing history.
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/artist-sync disable 6lcwlkAjBPSKnFBZjjZFJs
```

For a local checkout, run `npm run artist-sync -- enable <id>` at the repository
root to edit its local registry. Use the container for production edits: its working directory
is `/data`. Use `npx --prefix /app tsx ...` as shown: `npm --prefix /app run ...`
changes the working directory to `/app` and would select a different database.
The worker backs up a consistent registry snapshot after hourly collection and before
weekly merges. This includes enable flags, scheduling state, and unuploaded observations;
registry edits are backed up on the next run.

### Collection settings

Configure these environment variables in Coolify/Compose:

| Variable                       | Default | Meaning                                                                                      |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------- |
| `SYNC_INTERVAL_HOURS`          | `24`    | Minimum time between successful observations per artist; use `48` or `72` for fewer requests |
| `SYNC_REQUEST_SPACING_SECONDS` | `60`    | Minimum spacing between page requests                                                        |
| `SYNC_MAX_REQUESTS_PER_RUN`    | `5`     | Maximum artists attempted per hourly run                                                     |
| `SYNC_COOLDOWN_HOURS`          | `24`    | Global pause after throttling, blocking, network errors, or invalid HTML                     |
| `SYNC_FAILURE_RETRY_HOURS`     | `24`    | Minimum delay before retrying an individual failed artist                                    |

All settings must be positive integers. Requests are sequential, with oldest-successful
artists selected first. At the defaults, capacity is at most 120 attempts/day; a larger
roster waits its turn rather than increasing concurrency. HTTP 404 defers that artist;
other HTTP errors or parsing failures stop the batch. A longer `Retry-After` overrides
the global cooldown. There is no immediate retry loop. Due artists are checked on the
next hourly tick, so the configured interval is a minimum, not an exact appointment.

### Uploads, merges, and recovery

`artist-ids.db` includes a durable observation outbox. Each successful observation and
its scheduling update commit together. The worker uploads pending observations before
collecting more; failed uploads retain their rows for the next tick. Partial databases
are closed before upload and retries use the same key. Snapshots use their actual
observation timestamps, and API sampling allows artists to have different collection days.

A SQLite worker lock prevents collection and merging from overlapping and releases on
process/container exit. Registry edits remain available during collection. Logs report
collected/failed artists, cooldown deadlines, job failures, and merge checkpoints.

Weekly merging reads both legacy and new snapshot schemas and excludes replayed
`(id, timestamp)` observations. It builds a separate database, checks SQLite integrity,
uploads it to `spotify-data-backups`, then records the new local checkpoint and the exact
cleanup inputs in `/data/sync-checkpoint.json`. Only those inputs are deleted; interrupted
cleanup resumes before new work. Source files are retained if merging or backup fails.
Existing duplicates already inside a historical checkpoint are preserved.

Keep the entire `/data` volume across redeployments, including `sync-checkpoint.json`
and its referenced `spotify-data_checkpoint-*.db`. A missing referenced checkpoint stops
the worker rather than creating an incomplete history. To restore a lost volume, restore
the registry backup and the latest merged backup; remove the backup filename's `merged-`
prefix and recreate the manifest with its checkpoint filename and empty `cleanup` and
`remoteCleanup` arrays. Retained remote partials can then be replayed safely. Never restore
an old manifest pointing at a different checkpoint.

For maintenance, the following commands use the same worker lock and `/data` directory:

```sh
# Perform a normal collection/upload tick (also honors persisted cooldowns).
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/sync

# Run the scheduled merge/backup/cleanup flow now.
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/cron-service/merge.ts

# Build merged-spotify-data.db for the existing manual API publication procedure.
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/download-dbs
docker compose exec cron npx --prefix /app tsx /app/packages/scripts/src/merge-dbs
```

Publish the resulting database using the existing API maintenance procedure, stopping
and restarting the Docker API service around replacement of `/data/_spotify-data.db`.
Weekly backups do not update the API automatically. Leave room for both the existing
checkpoint and a new merged copy plus SQLite indexes/temporary files during a merge.
Begin with one enabled artist and inspect its counts/uploads from the server before
expanding the list; public-page availability can differ by server IP and change over time.
