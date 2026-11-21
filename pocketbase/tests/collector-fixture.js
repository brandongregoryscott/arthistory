module.exports = (app) => {
    const job = require(__hooks + "/artist-sync.js");
    const assert = (value, message) => {
        if (!value) {
            throw new Error(message);
        }
    };
    let now = Date.parse("2026-01-05T12:00:00.000Z");
    let calls = 0;
    const settings = () =>
        app.findFirstRecordByData("sync_settings", "key", "global");
    const state = () =>
        app.findFirstRecordByData("sync_state", "key", "global");
    const clear = () => {
        for (const name of ["snapshots", "artists"]) {
            for (const row of app.findAllRecords(name)) {
                app.delete(row);
            }
        }
        const policy = settings();
        policy.set("enabled", false);
        policy.set("namesBackfillEnabled", false);
        app.save(policy);
        const row = state();
        for (const field of [
            "attemptToken",
            "leaseUntil",
            "nextRequestAt",
            "cooldownUntil",
        ]) {
            row.set(field, "");
        }
        app.save(row);
    };
    const create = () => {
        const artist = new Record(app.findCollectionByNameOrId("artists"));
        artist.set("spotifyId", "6lcwlkAjBPSKnFBZjjZFJs");
        app.save(artist);
        return artist;
    };
    const enable = (artist) => {
        const policy = settings();
        policy.set("enabled", true);
        app.save(policy);
        artist.set("syncEnabled", true);
        app.save(artist);
    };
    const deps = {
        now: () => now,
        token: () => "collector-attempt",
        readPage: () => {
            calls++;
            assert(
                job.collect(app, deps).status === "idle" &&
                    job.tick(app, deps).status === "idle",
                "collection and names share overlap guard"
            );
            return {
                status: 200,
                displayName: "Alex G",
                retryAfterMs: null,
                metrics: {
                    followers: null,
                    monthlyListeners: 100,
                    popularity: null,
                },
            };
        },
    };
    clear();
    let artist = create();
    assert(
        job.collect(app, deps).status === "idle" && calls === 0,
        "disabled collector never fetches"
    );
    const policy = settings();
    policy.set("enabled", true);
    app.save(policy);
    assert(
        job.collect(app, deps).status === "idle" && calls === 0,
        "public/imported roster not enrolled"
    );
    enable(artist);
    assert(
        job.collect(app, deps).status === "collected",
        "enabled artist collected"
    );
    let rows = app.findAllRecords("snapshots");
    assert(
        rows.length === 1 &&
            rows[0].getString("weekStart") === "2026-01-05 00:00:00.000Z",
        "canonical UTC Monday snapshot"
    );
    const firstId = rows[0].id;
    assert(
        JSON.parse(rows[0].getString("metrics")).followers === null,
        "null does not become zero"
    );
    artist = app.findRecordById("artists", artist.id);
    assert(
        artist.getString("lastSuccessAt") === "2026-01-05 12:00:00.000Z" &&
            artist.getString("nextAttemptAt") === "2026-01-12 00:00:00.000Z",
        "atomic success and weekly due time"
    );
    assert(
        artist.getString("attemptToken") === "" &&
            state().getString("attemptToken") === "",
        "leases released"
    );
    assert(
        job.collect(app, deps).status === "idle" && calls === 1,
        "does not collect an artist again before due"
    );
    now += 3600000;
    artist.set("nextAttemptAt", "");
    app.save(artist);
    const newer = {
        ...deps,
        readPage: () => ({
            status: 200,
            displayName: "Updated public name",
            retryAfterMs: null,
            metrics: { followers: 0, monthlyListeners: null, popularity: null },
        }),
    };
    assert(
        job.collect(app, newer).status === "collected",
        "owner can request a newer weekly capture"
    );
    rows = app.findAllRecords("snapshots");
    assert(
        rows.length === 1 &&
            rows[0].id === firstId &&
            JSON.parse(rows[0].getString("metrics")).monthlyListeners ===
                null &&
            JSON.parse(rows[0].getString("metrics")).followers === 0,
        "latest complete capture replaces same week's metrics"
    );
    artist = app.findRecordById("artists", artist.id);
    assert(
        artist.getString("displayName") === "Updated public name",
        "collection refreshes automatic metadata"
    );
    artist.set("displayName", "Owner correction");
    job.stampOwnerName(artist, now);
    app.save(artist);
    assert(
        artist.getString("metadataSource") === "owner",
        "dashboard name correction marked owner controlled"
    );
    now += 28 * 86400000;
    assert(
        job.collect(app, deps).status === "collected",
        "missed ticks resume from current time"
    );
    assert(
        app.countRecords("snapshots") === 2 &&
            app
                .findRecordById("artists", artist.id)
                .getString("displayName") === "Owner correction",
        "no fake missed-week rows or overwritten owner names"
    );

    now += 3600000;
    artist = app.findRecordById("artists", artist.id);
    artist.set("nextAttemptAt", "");
    app.save(artist);
    const disable = {
        ...deps,
        readPage: () => {
            const row = app.findRecordById("artists", artist.id);
            row.set("syncEnabled", false);
            app.save(row);
            return deps.readPage();
        },
    };
    assert(
        job.collect(app, disable).status === "skipped" &&
            app.countRecords("snapshots") === 2,
        "disabling in flight prevents snapshot writes"
    );
    assert(
        !app.findRecordById("artists", artist.id).getBool("syncEnabled"),
        "owner disable preserved"
    );

    clear();
    artist = create();
    enable(artist);
    const failure = {
        ...deps,
        readPage: () => ({
            status: 429,
            displayName: null,
            retryAfterMs: 172800000,
        }),
    };
    assert(
        job.collect(app, failure).status === "failed" &&
            app.countRecords("snapshots") === 0,
        "failed capture creates no snapshot"
    );
    assert(
        app.findRecordById("artists", artist.id).getString("lastSuccessAt") ===
            "" &&
            Date.parse(state().getString("cooldownUntil")) === now + 172800000,
        "failure retains previous success and global cooldown"
    );
    assert(
        job.collect(app, deps).status === "idle",
        "cooldown blocks collection"
    );

    clear();
    artist = create();
    enable(artist);
    const rollback = { ...deps, token: () => "rollback-attempt" };
    let failed = false;
    try {
        job.collect(app, rollback);
    } catch (_) {
        failed = true;
    }
    assert(
        failed &&
            app.countRecords("snapshots") === 0 &&
            app
                .findRecordById("artists", artist.id)
                .getString("lastSuccessAt") === "",
        "snapshot and success roll back together after completion-save failure"
    );
    const recovery = state();
    recovery.set("attemptToken", "cleanup");
    app.save(recovery);
    clear();
};
