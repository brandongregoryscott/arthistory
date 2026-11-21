# PocketBase deployment

Merge the stack first, then deploy its final version with a small roster. Historical
import can wait. The public site will show only newly collected data until import.

## 1. Merge order

Pause any automatic production deployment before merging. Review, mark the drafts
ready and require passing checks. Merge bottom to top:

| PR                                                                 | Change                              |
| ------------------------------------------------------------------ | ----------------------------------- |
| [#93](https://github.com/brandongregoryscott/arthistory/pull/93)   | PocketBase setup, schema and client |
| [#94](https://github.com/brandongregoryscott/arthistory/pull/94)   | Prepare historical data             |
| [#96](https://github.com/brandongregoryscott/arthistory/pull/96)   | Load prepared records               |
| [#97](https://github.com/brandongregoryscott/arthistory/pull/97)   | Local artist cache and fuzzy search |
| [#98](https://github.com/brandongregoryscott/arthistory/pull/98)   | Snapshot reads and sparse charts    |
| [#99](https://github.com/brandongregoryscott/arthistory/pull/99)   | Public artist-page reader           |
| [#100](https://github.com/brandongregoryscott/arthistory/pull/100) | Name backfill                       |
| [#101](https://github.com/brandongregoryscott/arthistory/pull/101) | Weekly snapshot collection          |
| [#102](https://github.com/brandongregoryscott/arthistory/pull/102) | Rollout and native recovery         |
| [#103](https://github.com/brandongregoryscott/arthistory/pull/103) | Legacy cleanup and this guide       |

From the stack checkout, `gh stack merge 103 --yes --squash` merges all remaining
layers through #103 in dependency order. Keep the existing deployed version running;
#103 requires PocketBase and removes the old storage fallback.

## 2. Prepare the sidecar

On the deployment host, use the merged code and Node version from `.nvmrc`.
Preserve the previous API image, frontend build, configuration and original backups.
Stop/disable the old collector cron or service before enabling the new collector.

Add the PocketBase credentials from [the env example](apps/api/.env.example) to the
existing root `.env`; do not overwrite other deployment settings. For host-side CLI
commands, set `POCKETBASE_URL=http://127.0.0.1:6769`. Compose publishes PocketBase
on loopback port `6769` by default, keeping container port `8090` internal. If the
host port is occupied, set `DB_PORT` to a free port and update the host-side
`POCKETBASE_URL` to match. In Coolify, check for an existing `DB_PORT=8090`
override and remove it or change it to the chosen port before redeploying. Compose
supplies the container URL to the API. Keep all credentials server-side.

ArtHistory uses the adjacent port set web `6767`, API `6768`, PocketBase `6769`.
For an existing installation, update any old `PORT=3001` override to `6768` (or
remove it to use the default). The API container, health check and tunnel all use
`6768`; `PORT` controls only its published host port in Compose. Local frontend
development uses `VITE_API_URL=http://localhost:6768`. Production frontend builds
continue to use the public Express origin.

The commands below use the production Compose file explicitly, excluding the local
override. They assume the existing tunnel image/key and observability network are
available. Keep the same Compose project name on later deployments so its persistent
volume is reused.

```sh
npm ci
docker compose -f docker-compose.yml up -d --build pocketbase
docker compose -f docker-compose.yml ps pocketbase
docker compose -f docker-compose.yml logs --tail=100 pocketbase
```

Confirm health and successful migrations. Production Compose starts the dashboard
tuns.sh tunnel by default, like Noisehaus. For the sidecar-only preparation above,
start it explicitly:

```sh
docker compose -f docker-compose.yml up -d pocketbase-tunnel
docker compose -f docker-compose.yml logs --tail=50 pocketbase-tunnel
```

The tunnel requests `POCKETBASE_TUNNEL_NAME` (default `arthistory-pocketbase`), using
the registered SSH key at `TUNS_SSH_KEY_PATH` (default `/root/.ssh/tuns_ed25519`).
Open the assigned HTTPS URL from its logs with `/_/` appended, and sign in using
the configured PocketBase superuser credentials. Confirm the `sync_settings` record with
`key = global` has both `enabled` and `namesBackfillEnabled` off.

## 3. Collect a small roster

Seed the two default chart artists, plus any other chosen IDs/URLs:

```sh
npm run add-artist -- --artist https://open.spotify.com/artist/6lcwlkAjBPSKnFBZjjZFJs
npm run add-artist -- --artist https://open.spotify.com/artist/5AyEXCtu3xnnsTGCo4RVZh
```

Those commands run from the host checkout. The API image also ships the CLI
bundles and npm scripts: in Coolify's API container terminal (`/app`), use the same
`npm run add-artist -- --artist <id-or-url>` command. It uses the container's
PocketBase credentials and internal service URL. For a running Compose deployment:

```sh
docker compose -f docker-compose.yml exec api npm run add-artist -- --artist https://open.spotify.com/artist/6lcwlkAjBPSKnFBZjjZFJs
```

If only PocketBase is running during preparation, use
`docker compose -f docker-compose.yml run --rm --build --no-deps api npm run add-artist -- --artist <id-or-url>`.
This runs the bundled CLI without starting the Express server or tunnels.
`inspect-artist`, `prepare-import`, and `import-data` are also available in the
image. Production Compose binds `/root/arthistory-migration` to `/migration` in
the API container. Override the host path with `MIGRATION_DATA_PATH` if needed.
Create the host directory and copy any backup held in the current container to it
before redeploying. Prepare with `--source /migration/legacy-backup.db --output /migration/prepared-data`,
then import with `--input /migration/prepared-data`. These files persist on the
host across container replacements; preparation opens the source read-only.

The command creates named artists with syncing off. In the dashboard:

1. Set `artists.syncEnabled` on only for the chosen few artists.
2. Set `sync_settings.enabled` on; leave name backfill off for now.
3. Wait a few minute ticks. Verify one snapshot per artist/current Monday-start UTC
   week, a real `capturedAt`, numeric audience columns (`-1` when unavailable) and
   updated artist success/schedule fields.
4. Check logs for errors or cooldowns. Do not clear persisted cooldowns to force retries.

Configure native daily backups and bounded retention in Settings > Backups. Verify
an actual backup reaches the intended R2 destination, and rehearse restore before
public cutover using [the recovery instructions](README.md#native-backups-and-restore).
Use an outbound-isolated restore target because restored jobs/settings may be active.
Local restore tests have passed; production R2 access and recovery remain manual checks.

## 4. Cut over API and frontend together

Build the frontend with `VITE_API_URL` set to the public Express origin, using the
existing frontend deployment process. Publish `apps/web/dist` alongside the API cutover:

```sh
npm run build --workspace web
docker compose -f docker-compose.yml up -d --build api tunnel
docker compose -f docker-compose.yml logs --tail=100 api pocketbase
```

Check the public `/health`, `/meta/latest`, `/artists?ids=<spotify-id>` and
`/artists/<spotify-id>/snapshots` endpoints. Confirm the API logs `Artist cache ready`.
In the browser, verify both default artists, search (including `Dustr`), capture
freshness and charts with sparse history. Only stored names appear in search; allow
about a minute for cache refresh after edits/import. A fresh deployment has no old
history until it is imported. Resume normal deployment automation after these checks.

## 5. Backfill later; keep rollback available

Use the [historical import instructions](README.md#optional-historical-import) on the
single verified merged backup, with confirmed timestamp units and enough temporary
disk space. Use `--keep-id` for any defaults that must survive the pruning cutoff.
Compare report counts, retained history and nulls after loading; rerunning the same
export resumes safely. Existing enrollment is preserved; newly imported artists stay off.
Restarting repeats full export validation and existing-record lookups; it does not
resume from a saved cursor. Progress logs distinguish validation from writes. For
terminal-independent imports with logs under `/migration`, use the
[background command](README.md#optional-historical-import); a container restart
still stops the process.

Before loading, review preparation's `errors.jsonl` and `report.json` invalid-row
count. Malformed IDs/timestamps/metrics are audited and skipped automatically;
only valid captures determine pruning and weekly history. Unexpectedly high error
counts can indicate a wrong timestamp unit or source format. Keep the original
backup and error audit for investigation; the importer does not repair source IDs.

Then enable `sync_settings.namesBackfillEnabled` to resolve blank names. This shares
pacing/cooldowns with collection and does not enroll artists. Expand collection only
deliberately, after checking behavior, query latency, storage and backup size/duration.

If cutover fails, turn off both jobs, restore the previous API/frontend/configuration
and leave the PocketBase volume intact. Re-enable the old collector only after the
new collector is stopped. Keep original sources and rollback artifacts until recovery
has been verified. Never use `docker compose down -v` as a rollback step.

## Snapshot numeric-column upgrade

Migration `1794900003_snapshot_columns.js` replaces the JSON `metrics` field with
`followers`, `monthlyListeners`, and `popularity` number fields. It preserves IDs,
weekly identity, timestamps, provenance, and all available values, including legacy
popularity and measured zeros. JSON nulls become `-1`. HTML captures always use
`popularity = -1`. In the dashboard, enter `-1` for unavailable values; PocketBase's
number fields otherwise default to zero. The Express response still uses nulls.

Take a native backup, pause collection, and stop Express before upgrading the
sidecar and API together: the old API/collector expects JSON, while the new code
expects columns. PocketBase applies the conversion transactionally at startup;
allow temporary disk space for schema changes and verify row counts and sample
values before resuming service/collection. Prepared legacy exports remain compatible.
For rollback, stop the API/collector, run `pocketbase migrate down 1` with the matching
data/migrations directories, then deploy the previous application version. The down
migration reconstructs nullable JSON metrics. Retain the backup until verification.
