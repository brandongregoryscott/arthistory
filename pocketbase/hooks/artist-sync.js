// @ts-check
const { MISSING_METRIC } = require("./snapshot-metrics.cjs");
/** @typedef {import("./artist-sync-types.js").BackfillApp} BackfillApp */
/** @typedef {import("./artist-sync-types.js").BackfillDependencies} BackfillDependencies */
/** @typedef {import("./artist-sync-types.js").Claim} Claim */

const DAY_MS = 24 * 60 * 60 * 1000;
const ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const THROTTLE_COOLDOWN_MS = 60 * 60 * 1000;
const LEASE_GRACE_MS = 30000;

/** @param {BackfillApp} app @param {BackfillDependencies} dependencies */
const tick = (app, dependencies) => run({ app, dependencies, mode: "names" });

/** @param {BackfillApp} app @param {BackfillDependencies} dependencies */
const collect = (app, dependencies) =>
    run({ app, dependencies, mode: "snapshots" });

/** @param {{ app: BackfillApp, dependencies: BackfillDependencies, mode: "names" | "snapshots" }} options */
const run = ({ app, dependencies, mode }) => {
    /** @type {{ value?: Claim }} */
    const claimed = {};
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
            metadataUpdatedAt: artist.getString("metadataUpdatedAt"),
            intervalMs,
            spotifyId: artist.getString("spotifyId"),
            timeoutSeconds,
            token,
        };
    });
    const claim = claimed.value;
    if (claim == null) {
        return { status: "idle" };
    }

    /** @type {import("./artist-sync-types.js").PageResult} */
    let page;
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
                    const capture = saveSnapshot(tx, artist, page.metrics, now);
                    artist.set(
                        "lastSuccessAt",
                        date(
                            Math.max(
                                capture,
                                Date.parse(artist.getString("lastSuccessAt")) ||
                                    0
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
                    Date.parse(state.getString("nextRequestAt")) || 0
                )
            )
        );
        state.set("attemptToken", "");
        state.set("leaseUntil", "");
        tx.save(state);
    });

    return { status, artistId: claim.artistId, httpStatus: page.status };
};

/** @param {BackfillApp} app @param {import("./artist-sync-types.js").DataRecord} artist @param {NonNullable<import("./artist-sync-types.js").PageResult["metrics"]>} metrics @param {number} now */
const saveSnapshot = (app, artist, metrics, now) => {
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
        existing ?? new Record(app.findCollectionByNameOrId("snapshots"));
    row.set("artist", artist.id);
    row.set("weekStart", week);
    row.set("capturedAt", date(now));
    for (const key of /** @type {const} */ ([
        "followers",
        "monthlyListeners",
        "popularity",
    ])) {
        row.set(key, metrics[key] ?? MISSING_METRIC);
    }
    row.set("source", "spotify-public-page");
    app.save(row);

    return now;
};

/** @param {number} timestamp */
const monday = (timestamp) => {
    const value = new Date(timestamp);
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
    return value.getTime();
};

/** @param {BackfillApp} app @param {BackfillDependencies} dependencies */
const scheduled = (app, dependencies) => {
    const first =
        Math.floor(dependencies.now() / 60000) % 2 === 0 ? collect : tick;
    const second = first === collect ? tick : collect;
    const result = first(app, dependencies);
    return result.status === "idle" ? second(app, dependencies) : result;
};

/** @param {import("./artist-sync-types.js").DataRecord} record @param {number} now */
const stampOwnerName = (record, now) => {
    if (
        record.getString("displayName") !==
        record.original().getString("displayName")
    ) {
        record.set("metadataSource", "owner");
        record.set("metadataUpdatedAt", date(now));
    }
};

/** @param {import("./artist-sync-types.js").DataRecord} state @param {number} now @param {import("./artist-sync-types.js").PageResult} page */
const applyCooldown = (state, now, page) => {
    const minimum =
        page.status === 429 || page.status === 403
            ? THROTTLE_COOLDOWN_MS
            : ERROR_COOLDOWN_MS;
    const cooldown = Math.max(
        now + minimum,
        now + (page.retryAfterMs ?? 0),
        Date.parse(state.getString("cooldownUntil")) || 0
    );
    state.set("cooldownUntil", date(cooldown));
};

/** @param {BackfillApp} app */
const coverage = (app) => {
    const artists = app.countRecords("artists");
    const unresolved = app.countRecords(
        "artists",
        $dbx.hashExp({ displayName: "" })
    );

    return { artists, named: artists - unresolved, unresolved };
};

/** @param {number} timestamp */
const date = (timestamp) => new Date(timestamp).toISOString().replace("T", " ");

module.exports = { collect, coverage, scheduled, stampOwnerName, tick };
