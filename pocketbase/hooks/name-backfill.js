// @ts-check
/** @typedef {import("./backfill-types.js").BackfillApp} BackfillApp */
/** @typedef {import("./backfill-types.js").BackfillDependencies} BackfillDependencies */
/** @typedef {import("./backfill-types.js").Claim} Claim */

const DAY_MS = 24 * 60 * 60 * 1000;
const ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const THROTTLE_COOLDOWN_MS = 60 * 60 * 1000;
const LEASE_GRACE_MS = 30000;

/** @param {BackfillApp} app @param {BackfillDependencies} dependencies */
const tick = (app, dependencies) => {
    /** @type {{ value?: Claim }} */
    const claimed = {};
    app.runInTransaction((tx) => {
        const settings = tx.findFirstRecordByData(
            "sync_settings",
            "key",
            "global"
        );
        if (!settings.getBool("namesBackfillEnabled")) {
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
            "displayName = '' && (metadataNextAttemptAt = '' || metadataNextAttemptAt <= {:now})",
            "metadataNextAttemptAt,id",
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
        artist.set("metadataNextAttemptAt", date(now + DAY_MS));
        tx.save(state);
        tx.save(artist);
        claimed.value = {
            artistId: artist.id,
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

    /** @type {import("./backfill-types.js").PageResult} */
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
        if (page.status === 200 && page.displayName != null) {
            if (
                settings.getBool("namesBackfillEnabled") &&
                artist != null &&
                artist.getString("displayName") === "" &&
                artist.getString("spotifyId") === claim.spotifyId
            ) {
                artist.set("displayName", page.displayName);
                artist.set("metadataSource", "spotify-public-page");
                artist.set("metadataUpdatedAt", date(now));
                artist.set("metadataNextAttemptAt", "");
                tx.save(artist);
                status = "resolved";
            }
        } else {
            applyCooldown(state, now, page);
            status = "failed";
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

/** @param {import("./backfill-types.js").DataRecord} state @param {number} now @param {import("./backfill-types.js").PageResult} page */
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

module.exports = { coverage, tick };
