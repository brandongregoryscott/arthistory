module.exports = (app, fixtureHtml, unicodeHtml) => {
    const job = require(__hooks + "/name-backfill.js");
    const http = require(__hooks + "/artist-page-http.js");
    const ID = "6lcwlkAjBPSKnFBZjjZFJs";
    let now = Date.parse("2026-01-05T12:00:00.000Z");
    let calls = 0;
    const assert = (value, message) => {
        if (!value) {
            throw new Error(message);
        }
    };
    const settings = () =>
        app.findFirstRecordByData("sync_settings", "key", "global");
    const state = () =>
        app.findFirstRecordByData("sync_state", "key", "global");
    const create = (id = ID) => {
        const record = new Record(app.findCollectionByNameOrId("artists"));
        record.set("spotifyId", id);
        record.set("aliases", ["Owner alias"]);
        app.save(record);
        return record;
    };
    const reset = () => {
        for (const record of app.findAllRecords("artists")) {
            app.delete(record);
        }
        const policy = settings();
        policy.set("namesBackfillEnabled", true);
        policy.set("requestIntervalSeconds", 15);
        policy.set("requestTimeoutSeconds", 20);
        app.save(policy);
        const row = state();
        for (const field of [
            "leaseUntil",
            "attemptToken",
            "nextRequestAt",
            "cooldownUntil",
        ]) {
            row.set(field, "");
        }
        app.save(row);
        calls = 0;
    };
    const dependencies = {
        now: () => now,
        token: () => "test-name-attempt",
        readPage: (id, timeoutSeconds) => {
            calls++;
            assert(
                job.tick(app, dependencies).status === "idle",
                "overlapping invocation must not fetch"
            );
            const reserved = app.findFirstRecordByData(
                "artists",
                "spotifyId",
                id
            );
            assert(
                Date.parse(reserved.getString("metadataNextAttemptAt")) > now,
                "reserve before request"
            );
            return http.readArtistName({
                id,
                timeoutSeconds,
                now: () => now,
                execute: (args) => {
                    assert(
                        args.includes("--max-filesize") &&
                            args.includes("--max-time") &&
                            args.includes("--no-location") &&
                            args[0] === "-q",
                        "bounded curl arguments"
                    );
                    return (
                        "HTTP/2 200\r\ncontent-type: text/html\r\n\r\n" +
                        fixtureHtml
                    );
                },
            });
        },
    };

    assert(
        !settings().getBool("namesBackfillEnabled"),
        "backfill defaults off"
    );
    create();
    assert(
        job.tick(app, dependencies).status === "idle" && calls === 0,
        "disabled job does not fetch"
    );
    reset();
    const decoded = require(
        __hooks + "/artist-page-parser.cjs"
    ).parseArtistPage(fixtureHtml, ID, undefined);
    assert(decoded.displayName === "Alex G", "standalone parser");
    assert(
        decoded.metrics.followers === 4550328 &&
            decoded.metrics.monthlyListeners === 9137860 &&
            decoded.metrics.popularity === null,
        "native parser preserves audience values and nulls"
    );
    const parser = require(__hooks + "/artist-page-parser.cjs");
    assert(
        parser.parseArtistPage(unicodeHtml, ID).displayName ===
            "東京事変 & Sigur Rós",
        "native Unicode base64 decoding"
    );
    assert(
        $security.randomString(32).length === 32,
        "native attempt-token generator"
    );
    assert(
        toString($os.cmd("curl", "--version").output()).includes("curl"),
        "native curl execution and bytes conversion"
    );
    const readResponse = (raw) =>
        http.readArtistName({
            id: ID,
            timeoutSeconds: 20,
            now: () => now,
            execute: () => raw,
        });
    assert(
        readResponse(
            "HTTP/2 103\r\nLink: example\r\n\r\nHTTP/2 200\r\nContent-Type: text/html\r\n\r\n" +
                fixtureHtml
        ).displayName === "Alex G",
        "informational headers"
    );
    for (const retry of ["172800", new Date(now + 172800000).toUTCString()]) {
        assert(
            readResponse("HTTP/2 429\r\nRetry-After: " + retry + "\r\n\r\n")
                .retryAfterMs === 172800000,
            "HTTP Retry-After formats"
        );
    }
    assert(
        readResponse("HTTP/2 302\r\nLocation: https://other.example/\r\n\r\n")
            .status === 302,
        "redirects are not followed"
    );
    for (const raw of [
        "HTTP/2 200\r\nContent-Type: application/json\r\n\r\n{}",
        "HTTP/2 200\r\nContent-Type: text/html\r\n\r\nChallenge",
    ]) {
        let failed = false;
        try {
            readResponse(raw);
        } catch (_) {
            failed = true;
        }
        assert(failed, "invalid HTTP page rejected");
    }
    let artist = create();
    assert(job.tick(app, dependencies).status === "resolved", "resolves name");
    artist = app.findRecordById("artists", artist.id);
    assert(
        artist.getString("displayName") === "Alex G",
        "shared parser works in real JSVM"
    );
    assert(
        artist.getString("metadataSource") === "spotify-public-page" &&
            Date.parse(artist.getString("metadataUpdatedAt")) === now,
        "metadata provenance"
    );
    assert(
        !artist.getBool("syncEnabled") &&
            artist.getString("lastSuccessAt") === "" &&
            app.countRecords("snapshots") === 0,
        "backfill cannot enroll or write snapshots"
    );
    assert(
        artist.getString("aliases").includes("Owner alias"),
        "preserves aliases"
    );
    create("5AyEXCtu3xnnsTGCo4RVZh");
    assert(
        job.tick(app, dependencies).status === "idle" && calls === 1,
        "persisted pacing across invocations"
    );
    const coverage = job.coverage(app);
    assert(
        coverage.artists === 2 &&
            coverage.named === 1 &&
            coverage.unresolved === 1,
        "name coverage"
    );

    reset();
    artist = create();
    const updated = {
        ...dependencies,
        readPage: () => {
            const owner = app.findRecordById("artists", artist.id);
            owner.set("aliases", ["Edited during fetch"]);
            owner.set("syncEnabled", true);
            app.save(owner);
            return {
                status: 200,
                displayName: "Fetched name",
                retryAfterMs: null,
            };
        },
    };
    assert(
        job.tick(app, updated).status === "resolved",
        "fills a blank name after unrelated owner edits"
    );
    const saved = app.findRecordById("artists", artist.id);
    assert(
        saved.getBool("syncEnabled") &&
            saved.getString("aliases").includes("Edited during fetch"),
        "preserves concurrent aliases and explicit enrollment"
    );
    reset();
    artist = create();
    const changed = {
        ...dependencies,
        readPage: () => {
            const owner = app.findRecordById("artists", artist.id);
            owner.set("displayName", "Owner correction");
            app.save(owner);
            const policy = settings();
            policy.set("requestIntervalSeconds", 300);
            app.save(policy);
            return {
                status: 200,
                displayName: "Fetched name",
                retryAfterMs: null,
            };
        },
    };
    assert(
        job.tick(app, changed).status === "skipped",
        "owner edit during fetch wins"
    );
    assert(
        app.findRecordById("artists", artist.id).getString("displayName") ===
            "Owner correction",
        "owner name preserved"
    );

    assert(
        Date.parse(state().getString("nextRequestAt")) === now + 300000,
        "updated pacing policy applies after request"
    );

    reset();
    artist = create();
    const disabled = {
        ...dependencies,
        readPage: () => {
            const policy = settings();
            policy.set("namesBackfillEnabled", false);
            app.save(policy);
            return {
                status: 200,
                displayName: "Fetched name",
                retryAfterMs: null,
            };
        },
    };
    assert(
        job.tick(app, disabled).status === "skipped",
        "disabling during fetch stops writes"
    );

    for (const code of [403, 429, 503]) {
        reset();
        artist = create();
        const throttled = {
            ...dependencies,
            readPage: () => ({
                status: code,
                displayName: null,
                retryAfterMs: 2 * 86400000,
            }),
        };
        assert(
            job.tick(app, throttled).status === "failed",
            "HTTP error is recorded"
        );
        assert(
            Date.parse(state().getString("cooldownUntil")) ===
                now + 2 * 86400000,
            "long Retry-After persisted"
        );
        assert(
            job.tick(app, dependencies).status === "idle",
            "cooldown blocks subsequent runs"
        );
        assert(
            app
                .findRecordById("artists", artist.id)
                .getString("displayName") === "",
            "failure leaves unresolved"
        );
    }

    reset();
    artist = create();
    const failed = {
        ...dependencies,
        readPage: () => {
            throw new Error("Simulated timeout");
        },
    };
    assert(
        job.tick(app, failed).status === "failed",
        "transport failures are handled"
    );
    assert(
        Date.parse(state().getString("cooldownUntil")) === now + 300000,
        "transport cooldown"
    );
    now += 300001;
    assert(
        job.tick(app, dependencies).status === "idle",
        "failed artist attempt remains deferred after cooldown"
    );

    reset();
    artist = create();
    const stale = {
        ...dependencies,
        readPage: () => {
            const row = state();
            row.set("attemptToken", "another-worker");
            app.save(row);
            return { status: 200, displayName: "Stale", retryAfterMs: null };
        },
    };
    assert(
        job.tick(app, stale).status === "stale",
        "stale worker cannot commit"
    );
    assert(
        state().getString("attemptToken") === "another-worker",
        "stale worker cannot unlock another lease"
    );

    reset();
    artist = create();
    const lateThrottle = {
        ...dependencies,
        readPage: () => {
            const row = state();
            row.set("attemptToken", "another-worker");
            app.save(row);
            return { status: 429, displayName: null, retryAfterMs: 172800000 };
        },
    };
    assert(
        job.tick(app, lateThrottle).status === "stale",
        "late throttle cannot own completion"
    );
    assert(
        state().getString("attemptToken") === "another-worker" &&
            Date.parse(state().getString("cooldownUntil")) === now + 172800000,
        "late throttling persists without unlocking another worker"
    );
    reset();
    artist = create();
    const expired = {
        ...dependencies,
        readPage: () => {
            now += 151000;
            return { status: 200, displayName: "Too late", retryAfterMs: null };
        },
    };
    assert(
        job.tick(app, expired).status === "stale",
        "expired lease cannot commit"
    );
    assert(
        app.findRecordById("artists", artist.id).getString("displayName") ===
            "",
        "late response discarded"
    );

    reset();
    artist = create();
    const rollback = {
        ...dependencies,
        token: () => "rollback-attempt",
        readPage: () => ({
            status: 200,
            displayName: "Fetched name",
            retryAfterMs: null,
        }),
    };
    let rejected = false;
    try {
        job.tick(app, rollback);
    } catch (_) {
        rejected = true;
    }
    assert(rejected, "simulated completion-save failure");
    assert(
        app.findRecordById("artists", artist.id).getString("displayName") ===
            "",
        "failed transaction cannot partially save metadata"
    );
    assert(
        state().getString("attemptToken") === "rollback-attempt",
        "failed completion retains restart reservation"
    );

    const recoveredState = state();
    recoveredState.set("attemptToken", "cleanup");
    app.save(recoveredState);
    reset();
    const policy = settings();
    policy.set("namesBackfillEnabled", false);
    app.save(policy);
};

module.exports.crash = (app) => {
    const policy = app.findFirstRecordByData("sync_settings", "key", "global");
    policy.set("namesBackfillEnabled", true);
    app.save(policy);
    const artist = new Record(app.findCollectionByNameOrId("artists"));
    artist.set("spotifyId", "6lcwlkAjBPSKnFBZjjZFJs");
    app.save(artist);
    require(__hooks + "/name-backfill.js").tick(app, {
        now: () => Date.parse("2026-01-05T12:00:00.000Z"),
        token: () => "interrupted-attempt",
        readPage: () => $os.exit(0),
    });
};

module.exports.restart = (app) => {
    const job = require(__hooks + "/name-backfill.js");
    const assert = (value, message) => {
        if (!value) {
            throw new Error(message);
        }
    };
    let now = Date.parse("2026-01-05T12:00:00.000Z");
    let calls = 0;
    const deps = {
        now: () => now,
        token: () => "restarted-attempt",
        readPage: () => {
            calls++;
            return {
                status: 200,
                displayName: "Recovered",
                retryAfterMs: null,
            };
        },
    };
    assert(
        job.tick(app, deps).status === "idle" && calls === 0,
        "restart honors active lease"
    );
    now += 3600000;
    assert(
        job.tick(app, deps).status === "idle" && calls === 0,
        "restart honors reserved attempt after lease expiry"
    );
    const artist = new Record(app.findCollectionByNameOrId("artists"));
    artist.set("spotifyId", "5AyEXCtu3xnnsTGCo4RVZh");
    app.save(artist);
    assert(
        job.tick(app, deps).status === "resolved" && calls === 1,
        "restart can progress to another artist"
    );
    for (const row of app.findAllRecords("artists")) {
        app.delete(row);
    }
    const state = app.findFirstRecordByData("sync_state", "key", "global");
    for (const field of [
        "leaseUntil",
        "attemptToken",
        "nextRequestAt",
        "cooldownUntil",
    ]) {
        state.set(field, "");
    }
    app.save(state);
    const settings = app.findFirstRecordByData(
        "sync_settings",
        "key",
        "global"
    );
    settings.set("namesBackfillEnabled", false);
    app.save(settings);
};
