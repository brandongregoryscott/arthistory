// Loaded only by the disposable test command, never in the deployed sidecar.
module.exports = (app) => {
    const assert = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    const rejects = (operation, message) => {
        let failed = false;
        try {
            operation();
        } catch (_) {
            failed = true;
        }
        assert(failed, message);
    };
    const create = (collection, data) => {
        const record = new Record(app.findCollectionByNameOrId(collection));
        record.load(data);
        app.save(record);
        return record;
    };
    for (const name of [
        "artists",
        "snapshots",
        "sync_settings",
        "sync_state",
    ]) {
        const collection = app.findCollectionByNameOrId(name);
        for (const rule of [
            "listRule",
            "viewRule",
            "createRule",
            "updateRule",
            "deleteRule",
        ]) {
            assert(collection[rule] === null, name + " must be locked");
        }
    }
    assert(
        !app
            .findFirstRecordByData("sync_settings", "key", "global")
            .getBool("enabled"),
        "collection starts disabled"
    );
    const artist = create("artists", {
        spotifyId: "1234567890123456789012",
        displayName: "Duster",
        aliases: ["Düster"],
        searchNames: ["duster"],
    });
    assert(!artist.getBool("syncEnabled"), "import must not enable sync");
    rejects(
        () => create("artists", { spotifyId: artist.getString("spotifyId") }),
        "duplicate Spotify ID"
    );
    rejects(
        () => create("artists", { spotifyId: "bad" }),
        "invalid Spotify ID"
    );
    rejects(
        () =>
            create("artists", {
                spotifyId: "2234567890123456789012",
                aliases: [12],
            }),
        "invalid aliases"
    );
    assert(
        app.findRecordsByFilter(
            "artists",
            "snapshots_via_artist.id != ''",
            "id",
            10,
            0
        ).length === 0,
        "no history back-relation"
    );
    const snapshot = {
        artist: artist.id,
        weekStart: "2026-01-05 00:00:00.000Z",
        capturedAt: "2026-01-07 12:34:56.000Z",
        followers: -1,
        popularity: 0,
        monthlyListeners: -1,
        source: "fixture",
    };
    const row = create("snapshots", snapshot);
    assert(
        app.findRecordsByFilter(
            "artists",
            "snapshots_via_artist.id != ''",
            "id",
            10,
            0
        ).length === 1,
        "history back-relation"
    );
    assert(
        app
            .findCollectionByNameOrId("snapshots")
            .indexes.some((index) => index.includes("snapshots_capture")),
        "capture freshness index"
    );
    const selected = app.findRecordsByFilter(
        "snapshots",
        "(artist.spotifyId = {:spotifyId}) && id > {:cursor}",
        "id",
        500,
        0,
        { spotifyId: artist.getString("spotifyId"), cursor: "" }
    );
    assert(
        selected.length === 1 && selected[0].id === row.id,
        "snapshot artist relation/cursor filter"
    );
    assert(
        app.findRecordsByFilter("snapshots", "", "-capturedAt", 1, 0)[0].id ===
            row.id,
        "capture freshness order"
    );
    const stored = app.findRecordById("snapshots", row.id);
    assert(
        stored.getInt("followers") === -1 &&
            stored.getInt("popularity") === 0 &&
            stored.getInt("monthlyListeners") === -1,
        "missing sentinel and zero roundtrip"
    );
    rejects(() => create("snapshots", snapshot), "artist/week uniqueness");
    for (const metrics of [
        { followers: 1, popularity: 101, monthlyListeners: -1 },
        { followers: -2, popularity: -1, monthlyListeners: -1 },
        { followers: 1.5, popularity: -1, monthlyListeners: -1 },
    ]) {
        rejects(
            () =>
                create("snapshots", {
                    ...snapshot,
                    weekStart: "2026-01-12 00:00:00.000Z",
                    capturedAt: "2026-01-13 00:00:00.000Z",
                    ...metrics,
                }),
            "invalid metrics"
        );
    }
    rejects(
        () =>
            create("snapshots", {
                ...snapshot,
                weekStart: "2026-01-06 00:00:00.000Z",
            }),
        "Tuesday bucket"
    );
    rejects(
        () =>
            create("snapshots", {
                ...snapshot,
                capturedAt: "2026-01-12 00:00:00.000Z",
            }),
        "capture outside bucket"
    );
    rejects(
        () =>
            app.runInTransaction((tx) => {
                const newRow = new Record(
                    tx.findCollectionByNameOrId("snapshots")
                );
                newRow.load({
                    ...snapshot,
                    weekStart: "2026-01-12 00:00:00.000Z",
                    capturedAt: "2026-01-13 00:00:00.000Z",
                });
                tx.save(newRow);
                artist.set("lastSuccessAt", "2026-01-13 00:00:00.000Z");
                tx.save(artist);
                throw new Error("simulated failure");
            }),
        "transaction should fail"
    );
    assert(app.countRecords("snapshots") === 1, "snapshot rollback");
    assert(
        app.findRecordById("artists", artist.id).getString("lastSuccessAt") ===
            "",
        "success rollback"
    );
    row.set("capturedAt", "2026-01-08 00:00:00.000Z");
    row.set("followers", 10000);
    row.set("popularity", -1);
    row.set("monthlyListeners", 42);
    app.save(row);
    assert(
        app.countRecords("snapshots") === 1,
        "latest capture updates weekly row"
    );

    for (const name of ["snapshots", "artists"]) {
        for (const record of app.findAllRecords(name)) {
            app.delete(record);
        }
    }
};
