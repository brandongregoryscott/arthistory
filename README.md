# ArtHistory

Historical Spotify artist audience data, served by an Express API and React frontend.
PocketBase owns artist metadata, weekly snapshots, scheduled collection, the private
owner dashboard and native backups. Search uses a bounded local Fuse.js index;
browsers call Express and never need PocketBase credentials or Spotify API keys.

## Start a small deployment

See [the deployment checklist](DEPLOYMENT.md) for PR merge order, manual cutover
steps and rollback.

Use Node from `.nvmrc`. Copy `apps/api/.env.example` to the root `.env`, configure
server-side PocketBase credentials, and keep that file out of Git. Compose starts
the persistent PocketBase sidecar and waits for it before starting the API.

The default port set follows boilerplate's adjacent-port convention: web `6767`,
API `6768`, and PocketBase `6769`. Compose host ports are configurable with `PORT`
and `DB_PORT`; update the host-side URLs to match any overrides.
PocketBase publishes on `127.0.0.1:6769` for host-side commands. If that port is
occupied, set `DB_PORT` and the host-side `POCKETBASE_URL` to a free port in
`.env`. The API container and dashboard tunnel use `pocketbase:8090` internally.

```sh
npm ci
docker compose up -d --build pocketbase
npm run add-artist -- --artist https://open.spotify.com/artist/6lcwlkAjBPSKnFBZjjZFJs
npm run add-artist -- --artist https://open.spotify.com/artist/5AyEXCtu3xnnsTGCo4RVZh
npm run build --workspace web
```

Keep the current public API/frontend running while the sidecar and initial roster
are prepared. After the dashboard checks below, start the new API/tunnel and publish
the matching frontend build; the chart needs its sparse-series alignment code.
Existing routes and response envelopes are preserved.

The add command verifies one public artist page and creates a named artist with
syncing **off**. It accepts an ID or URL, preserves existing owner records, and uses
IDs compatible with a later history import. `inspect-artist` reads a page without
writing anything. Neither command starts background collection.

Production Compose starts the PocketBase tuns.sh tunnel automatically, using
`POCKETBASE_TUNNEL_NAME` (default `arthistory-pocketbase`) and the host's registered
SSH key. Read its assigned HTTPS URL from the `pocketbase-tunnel` container logs,
then open `/_/` and sign in with the PocketBase superuser
credentials. The local override disables tunnels by default; opt in with
`docker compose --profile tunnels up -d pocketbase-tunnel`. Enroll only a
small chosen roster with `artists.syncEnabled`, then enable `sync_settings.enabled`
on the global record. Both are required. Confirm current-week snapshots, capture
times, then cut over the API and matching frontend:

```sh
docker compose up -d --build api tunnel
```

Check Express/chart behavior before expanding enrollment. Public artist requests
remain analytics-only and never enable syncing.

## Collection and name backfill

The `artist-sync` cron runs each minute and takes one due artist per invocation.
It alternates collection/name-backfill priority, sharing persisted request spacing,
leases and cooldowns. Configure `requestIntervalSeconds` and
`requestTimeoutSeconds` in `sync_settings`. Startup inspects persisted due state;
the next tick resumes it. Failed/interrupted attempts remain deferred for a day.
HTTP 403/429 pauses automated page work for at least an hour; other failures pause
it for five minutes. Longer Retry-After delays are preserved.

Collection writes the current Monday-start UTC week and actual `capturedAt` time.
Newer captures replace that week's complete metrics. Snapshot/success writes commit
together. Missing followers/popularity/monthlyListeners remain null, measured zero
remains zero, and missed weeks stay missing. Dashboard name corrections become
owner metadata and are preserved, including edits during a fetch.

Enable `sync_settings.namesBackfillEnabled` to fill unresolved artist names without
enrolling them. Both jobs start disabled. Outcomes log coverage and HTTP status;
filter the artists collection with `displayName = ""` to inspect unresolved IDs.
The API rebuilds its cache every minute and retains the last complete index on a
refresh failure. Search never scrapes; it covers stored names/aliases, supports
typos such as Dustr → Duster, and preserves accents/non-Latin display names and
distinct artist IDs. History availability (`isTracked`/`hasHistory`) and enrollment
(`syncEnabled`) are separate.

## Optional historical import

A fresh small roster can collect before importing old history. Keep original
backups and the previous deployment/image/configuration for rollback. Select the
latest merged source backup by verified contents/timestamps, not filename or size.
The isolated import bridge reads the old SQLite format; application reads and jobs
use PocketBase exclusively.

```sh
npm run prepare-import -- --source ./backup.db --timestamp-unit seconds --inventory
npm run prepare-import -- --source ./backup.db --timestamp-unit seconds --output ./prepared-data
npm run import-data -- --input ./prepared-data
```

Preparation opens the source read-only, checks integrity/counts/date range, and
streams deterministic JSONL. SQLite sorting needs temporary disk space; allow
several times the source size. The default cutoff retains artists whose latest
known non-null follower count is **at least 10,000**, preserving their earlier weekly
history. Override with `--cutoff` or repeated `--keep-id`. Latest complete captures
win; ties use the larger source rowid. Nulls, timestamp units and provenance survive.

The new output directory contains artists/snapshots, exclusions and report counts.
Existing output paths are rejected. Loading preflights the full export in bounded
memory, then uses sequential record batches. Rerun the same export after interruption:
matching records/newer captures are skipped, owner metadata/enrollment is preserved,
and conflicts stop the load. Imported artists remain disabled. Compare counts and
coverage before enabling name backfill; never enroll the imported roster wholesale.

## Native backups and restore

In PocketBase Settings > Backups, configure a daily schedule such as `0 3 * * *`
and bounded retention such as seven scheduled backups. Use its native S3 destination
for the `arthistory-backups` R2 bucket, account endpoint, region `auto` and
backup-scoped credentials. Keep secrets/encryption keys outside Git and preserve
matching environment secrets for restore. Do not reuse/delete migration source
objects. No custom backup manifest or application backup endpoint is involved.

Before cutover, create a native backup and restore it into an isolated data copy
with the matching PocketBase version and versioned hooks/migrations. Allow at least
twice the backup size as free space. Native restore replaces the data directory and
restarts the app. Start the rehearsal target with outbound network access blocked:
restored settings may contain enabled jobs and the production R2 destination.
Before reconnecting it, disable collection/backfill and native scheduled backups in
the restored dashboard, and use an isolated backup destination for further tests.
Verify records, nulls, settings, files, rebuilt search and chart queries before accepting it. Retain
the previous image/configuration and original sources until recovery is verified.

The native test suite backs up disposable data, mutates it, invokes native restore,
restarts and checks records/settings/files. Actual R2 access, retained database and
index size, backup size/duration, real query latency and visual chart verification
still require measurement on the deployment target.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Set `POCKETBASE_TEST_BINARY` to the pinned executable to include native schema,
transaction, collection/backfill, restart and full restore tests under `npm test`.
Without it the native fixture explicitly skips; CI installs the pinned binary.
Container CI builds API/PocketBase and checks migrations. No separate migration
test command, Spotify Web API credential, fragment sync service or direct API access
to PocketBase's SQLite files is needed.
