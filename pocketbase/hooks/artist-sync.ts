import type { SongSnapshot } from "@repo/common";
import type { PageResult } from "./artist-page-http.js";
import { MISSING_METRIC } from "./constants.js";

type DataRecord = {
    getBool(field: string): boolean;
    getInt(field: string): number;
    getString(field: string): string;
    id: string;
    original(): DataRecord;
    set(field: string, value: unknown): void;
};

type SyncApp = {
    countRecords(collection: string, filter?: unknown): number;
    delete(record: DataRecord): void;
    findCollectionByNameOrId(collection: string): unknown;
    findFirstRecordByData(
        collection: string,
        field: string,
        value: string
    ): DataRecord;
    findRecordById(collection: string, id: string): DataRecord;
    findRecordsByFilter(
        collection: string,
        filter: string,
        sort: string,
        limit: number,
        offset: number,
        params?: Record<string, unknown>
    ): DataRecord[];
    runInTransaction(operation: (app: SyncApp) => void): void;
    save(record: DataRecord): void;
};

type SyncDependencies = {
    now(): number;
    readPage(id: string, timeoutSeconds: number): PageResult;
    token(): string;
};

type Claim = {
    artistId: string;
    displayName: string;
    intervalMs: number;
    metadataUpdatedAt: string;
    spotifyId: string;
    timeoutSeconds: number;
    token: string;
};

type RunOptions = {
    app: SyncApp;
    dependencies: SyncDependencies;
    mode: "names" | "snapshots";
};

const DAY_MS = 24 * 60 * 60 * 1000;

const ERROR_COOLDOWN_MS = 5 * 60 * 1000;

const THROTTLE_COOLDOWN_MS = 60 * 60 * 1000;

const LEASE_GRACE_MS = 30000;

const tick = (app: SyncApp, dependencies: SyncDependencies) =>
    run({ app, dependencies, mode: "names" });

const collect = (app: SyncApp, dependencies: SyncDependencies) =>
    run({ app, dependencies, mode: "snapshots" });

const run = ({ app, dependencies, mode }: RunOptions) => {
    const claimed: { value?: Claim } = {};

    app.runInTransaction((tx) => {
        const settings = tx.findFirstRecordByData(
            "sync_settings",
            "key",
            "global"
        );

        if (
            !settings.getBool(
                mode === "names" ? "namesBackfillEnabled" : "enabled"
            )
        ) {
            return;
        }

        const state = tx.findFirstRecordByData("sync_state", "key", "global");
        const now = dependencies.now();

        if (
            ["leaseUntil", "nextRequestAt", "cooldownUntil"].some(
                (field) => Date.parse(state.getString(field)) > now
            )
        ) {
            return;
        }

        const rows = tx.findRecordsByFilter(
            "artists",
            mode === "names"
                ? "displayName = '' && (metadataNextAttemptAt = '' || metadataNextAttemptAt <= {:now})"
                : "syncEnabled = true && (nextAttemptAt = '' || nextAttemptAt <= {:now})",
            mode === "names" ? "metadataNextAttemptAt,id" : "nextAttemptAt,id",
            1,
            0,
            { now: date(now) }
        );
        const [artist] = rows;

        if (artist == null) {
            return;
        }

        const timeoutSeconds = settings.getInt("requestTimeoutSeconds");
        const intervalMs = settings.getInt("requestIntervalSeconds") * 1000;
        const token = dependencies.token();

        state.set("attemptToken", token);
        state.set(
            "leaseUntil",
            date(now + timeoutSeconds * 1000 + LEASE_GRACE_MS)
        );
        state.set("nextRequestAt", date(now + intervalMs));
        artist.set(
            mode === "names" ? "metadataNextAttemptAt" : "nextAttemptAt",
            date(now + DAY_MS)
        );

        if (mode === "snapshots") {
            artist.set("lastAttemptAt", date(now));
            artist.set("attemptToken", token);
            artist.set("leaseUntil", state.getString("leaseUntil"));
        }

        tx.save(state);
        tx.save(artist);
        claimed.value = {
            artistId: artist.id,
            displayName: artist.getString("displayName"),
            intervalMs,
            metadataUpdatedAt: artist.getString("metadataUpdatedAt"),
            spotifyId: artist.getString("spotifyId"),
            timeoutSeconds,
            token,
        };
    });

    const claim = claimed.value;

    if (claim == null) {
        return { status: "idle" };
    }

    let page: PageResult;

    try {
        page = dependencies.readPage(claim.spotifyId, claim.timeoutSeconds);
    } catch (_) {
        page = { displayName: null, retryAfterMs: null, status: 0 };
    }

    let status = "stale";

    app.runInTransaction((tx) => {
        const state = tx.findFirstRecordByData("sync_state", "key", "global");
        const now = dependencies.now();

        if (
            state.getString("attemptToken") !== claim.token ||
            !(Date.parse(state.getString("leaseUntil")) > now)
        ) {
            if (page.status === 403 || page.status === 429) {
                applyCooldown(state, now, page);
                tx.save(state);
            }

            return;
        }

        const settings = tx.findFirstRecordByData(
            "sync_settings",
            "key",
            "global"
        );
        const rows = tx.findRecordsByFilter("artists", "id = {:id}", "", 1, 0, {
            id: claim.artistId,
        });
        const [artist] = rows;

        status = "skipped";

        const ownsArtist =
            artist != null && artist.getString("attemptToken") === claim.token;

        if (
            page.status === 200 &&
            page.displayName != null &&
            (mode === "names" || page.metrics != null)
        ) {
            const eligible =
                artist != null &&
                artist.getString("spotifyId") === claim.spotifyId &&
                settings.getBool(
                    mode === "names" ? "namesBackfillEnabled" : "enabled"
                ) &&
                (mode === "names"
                    ? artist.getString("displayName") === ""
                    : artist.getBool("syncEnabled") && ownsArtist);

            if (eligible && artist != null) {
                const canRefreshName =
                    artist.getString("displayName") === "" ||
                    (mode === "snapshots" &&
                        artist.getString("metadataSource") ===
                            "spotify-public-page" &&
                        artist.getString("displayName") === claim.displayName &&
                        artist.getString("metadataUpdatedAt") ===
                            claim.metadataUpdatedAt);

                if (canRefreshName) {
                    artist.set("displayName", page.displayName);
                    artist.set("metadataSource", "spotify-public-page");
                    artist.set("metadataUpdatedAt", date(now));
                    artist.set("metadataNextAttemptAt", "");
                }

                if (mode === "snapshots" && page.metrics != null) {
                    const capture = saveSnapshot(tx, artist, page, now);

                    artist.set(
                        "lastSuccessAt",
                        date(
                            Math.max(
                                capture,
                                timestampOrZero(
                                    artist.getString("lastSuccessAt")
                                )
                            )
                        )
                    );
                    artist.set(
                        "nextAttemptAt",
                        date(monday(capture) + 7 * DAY_MS)
                    );
                }

                tx.save(artist);
                status = mode === "names" ? "resolved" : "collected";
            }
        } else {
            applyCooldown(state, now, page);
            status = "failed";
        }

        if (mode === "snapshots" && artist != null && ownsArtist) {
            artist.set("attemptToken", "");
            artist.set("leaseUntil", "");
            tx.save(artist);
        }

        state.set(
            "nextRequestAt",
            date(
                Math.max(
                    now +
                        Math.max(
                            claim.intervalMs,
                            settings.getInt("requestIntervalSeconds") * 1000
                        ),
                    timestampOrZero(state.getString("nextRequestAt"))
                )
            )
        );
        state.set("attemptToken", "");
        state.set("leaseUntil", "");
        tx.save(state);
    });

    return { artistId: claim.artistId, httpStatus: page.status, status };
};

const saveSnapshot = (
    app: SyncApp,
    artist: DataRecord,
    page: PageResult,
    now: number
) => {
    const week = date(monday(now));
    const [existing] = app.findRecordsByFilter(
        "snapshots",
        "artist = {:artist} && weekStart = {:week}",
        "",
        1,
        0,
        { artist: artist.id, week }
    );
    const previousCapture =
        existing == null ? NaN : Date.parse(existing.getString("capturedAt"));

    if (previousCapture > now) {
        return previousCapture;
    }

    const row =
        existing ??
        new Record(
            app.findCollectionByNameOrId("snapshots") as core.Collection
        );

    row.set("artist", artist.id);
    row.set("weekStart", week);
    row.set("capturedAt", date(now));

    for (const key of [
        "followers",
        "monthlyListeners",
        "popularity",
    ] as const) {
        row.set(key, page.metrics?.[key] ?? MISSING_METRIC);
    }

    row.set("source", "spotify-public-page");
    app.save(row);
    saveSongSnapshots(app, artist.id, page.songs ?? [], week, now);

    return now;
};

const saveSongSnapshots = (
    app: SyncApp,
    artistId: string,
    songs: SongSnapshot[],
    week: string,
    now: number
) => {
    // Replace this capture's observations atomically with the artist snapshot.
    // Keep song identities and all earlier weeks even when tracks leave the page.
    const previous = app.findRecordsByFilter(
        "song_snapshots",
        "artist = {:artist} && weekStart = {:week}",
        "",
        0,
        0,
        { artist: artistId, week }
    );

    for (const row of previous) {
        app.delete(row);
    }

    for (const observation of songs) {
        const [existing] = app.findRecordsByFilter(
            "songs",
            "spotifyId = {:id}",
            "",
            1,
            0,
            { id: observation.spotifyId }
        );
        const song =
            existing ??
            new Record(
                app.findCollectionByNameOrId("songs") as core.Collection
            );

        song.set("spotifyId", observation.spotifyId);
        song.set("name", observation.name);
        app.save(song);

        const row = new Record(
            app.findCollectionByNameOrId("song_snapshots") as core.Collection
        );

        row.set("artist", artistId);
        row.set("song", song.id);
        row.set("name", observation.name);
        row.set("weekStart", week);
        row.set("capturedAt", date(now));
        row.set("listenCount", observation.listenCount ?? MISSING_METRIC);
        row.set("source", "spotify-public-page");
        app.save(row);
    }
};

const monday = (timestamp: number) => {
    const value = new Date(timestamp);

    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));

    return value.getTime();
};

const scheduled = (app: SyncApp, dependencies: SyncDependencies) => {
    const first =
        Math.floor(dependencies.now() / 60000) % 2 === 0 ? collect : tick;
    const second = first === collect ? tick : collect;
    const result = first(app, dependencies);

    return result.status === "idle" ? second(app, dependencies) : result;
};

const stampOwnerName = (record: DataRecord, now: number) => {
    if (
        record.getString("displayName") !==
        record.original().getString("displayName")
    ) {
        record.set("metadataSource", "owner");
        record.set("metadataUpdatedAt", date(now));
    }
};

const applyCooldown = (state: DataRecord, now: number, page: PageResult) => {
    const minimum =
        page.status === 429 || page.status === 403
            ? THROTTLE_COOLDOWN_MS
            : ERROR_COOLDOWN_MS;
    const cooldown = Math.max(
        now + minimum,
        now + (page.retryAfterMs ?? 0),
        timestampOrZero(state.getString("cooldownUntil"))
    );

    state.set("cooldownUntil", date(cooldown));
};

const coverage = (app: SyncApp) => {
    const artists = app.countRecords("artists");
    const unresolved = app.countRecords(
        "artists",
        $dbx.hashExp({ displayName: "" })
    );

    return { artists, named: artists - unresolved, unresolved };
};

const timestampOrZero = (value: string) => {
    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? 0 : timestamp;
};

const date = (timestamp: number) =>
    new Date(timestamp).toISOString().replace("T", " ");

export { collect, coverage, scheduled, stampOwnerName, tick };
export type { Claim, DataRecord, PageResult, SyncApp, SyncDependencies };
