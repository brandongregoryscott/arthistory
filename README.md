# ArtHistory

Historical Spotify artist audience data, served by an Express API and React frontend.
PocketBase owns artist metadata, weekly snapshots, scheduled collection, the private
owner dashboard and native backups. Search uses a bounded local Fuse.js index;
browsers call Express and never need PocketBase credentials or Spotify API keys.

## Start a small deployment

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

The add command verifies one public artist page and creates a named artist with
syncing **off**. It accepts an ID or URL, preserves existing owner records, and uses
PocketBase-generated record IDs. `inspect-artist` reads a page without
writing anything. Neither command starts background collection.

The API image includes bundled versions of `add-artist` and `inspect-artist`.
In Coolify's API container terminal at `/app`, run the same npm command directly:

```sh
npm run add-artist -- --artist https://open.spotify.com/artist/6lcwlkAjBPSKnFBZjjZFJs
```

From a Compose host, use `docker compose exec api npm run add-artist -- --artist <id>`.
The container inherits its PocketBase credentials and internal URL from Compose.
Production Compose starts the PocketBase tuns.sh tunnel automatically, using
`POCKETBASE_TUNNEL_NAME` (default `arthistory-pocketbase`) and the host's registered
SSH key. Read its assigned HTTPS URL from the `pocketbase-tunnel` container logs,
then open `/_/` and sign in with the PocketBase superuser
credentials. The local override disables tunnels by default; opt in with
`docker compose --profile tunnels up -d pocketbase-tunnel`. Enroll only a
small chosen roster with `artists.syncEnabled`, then enable `sync_settings.enabled`
on the global record. Both are required. Confirm current-week snapshots, capture
times, then start the API:

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
together. Snapshots store `followers`, `monthlyListeners` and `popularity` in numeric
columns; `-1` means unavailable and measured zero remains zero. HTML collection
always writes `popularity = -1`.
Express translates `-1` to `null` so charts show gaps, and missed weeks stay missing.
Dashboard name corrections become owner metadata and are preserved, including
edits during a fetch.

Enable `sync_settings.namesBackfillEnabled` to fill unresolved artist names without
enrolling them. Both jobs start disabled. Outcomes log coverage and HTTP status;
filter the artists collection with `displayName = ""` to inspect unresolved IDs.
The API rebuilds its cache every minute and retains the last complete index on a
refresh failure. Search never scrapes; it covers stored names/aliases, supports
typos such as Dustr → Duster, and preserves accents/non-Latin display names and
distinct artist IDs. History availability (`isTracked`/`hasHistory`) and enrollment
(`syncEnabled`) are separate.

## Native backups and restore

In PocketBase Settings > Backups, configure a daily schedule such as `0 3 * * *`
and bounded retention such as seven scheduled backups. Use its native S3 destination
for the `arthistory-backups` R2 bucket, account endpoint, region `auto` and
backup-scoped credentials. Keep secrets/encryption keys outside Git and preserve
matching environment secrets for restore.

Periodically create a native backup and restore it into an isolated data copy
with the matching PocketBase version and versioned hooks/migrations. Allow at least
twice the backup size as free space. Native restore replaces the data directory and
restarts the app. Start the rehearsal target with outbound network access blocked:
restored settings may contain enabled jobs and the production R2 destination.
Before reconnecting it, disable collection/backfill and native scheduled backups in
the restored dashboard, and use an isolated backup destination for further tests.
Verify records, nulls, settings, files, rebuilt search and chart queries before accepting it. Retain
the previous image/configuration until recovery is verified.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover the API services, artist search/cache, artist-page parser, snapshot
storage/series, request handling and monitoring. Container CI builds the API and
PocketBase images and checks that schema migrations apply. PocketBase schema
migrations remain versioned deployment assets.

## Extract one artist from a legacy backup

Run this TypeScript script on your laptop using Node from `.nvmrc` and the
repository’s `tsx` dependency (`npm ci` if dependencies are not installed). It opens the legacy backup
read-only and keeps the latest capture per Monday-start UTC week (larger source
rowid wins timestamp ties). There is no follower cutoff. Missing metrics become
`-1`, and the original capture time and row provenance are preserved.

```sh
npx tsx scripts/extract-artist-snapshots.ts \
  ~/arthistory/merged-spotify-data_1769922000.db \
  3AzjK40JembVLZUh90slUW --output artist-snapshots.json
```

To also import, add `--pocketbase https://YOUR-POCKETBASE-HOST` to the command
(use the dashboard origin without `/_/`). Email and password are prompted locally;
the password is hidden and never saved. Omit `--output` when rerunning an import,
since existing output files are never overwritten. No SSH or server-side script is
needed. The default timestamp unit is seconds; use `--timestamp-unit milliseconds`
only for a source that stores milliseconds.

The importer uses PocketBase's built-in authenticated record endpoints. It finds
or creates the artist with syncing off, preserves existing artist metadata and
enrollment, and skips every existing artist/week. It never overwrites live captures.
If interrupted, rerun to fill the remaining weeks. New artists have a blank name;
set their display name in the dashboard afterward. Without `--pocketbase`, the
script only extracts data and makes no network requests.
