// Test existing JSON data, including nulls, real zeros and legacy popularity.
module.exports = (app, phase) => {
    const assert = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    const id = "9999999999999999999999";
    const samples = [
        { followers: null, monthlyListeners: null, popularity: null },
        { followers: 0, monthlyListeners: 0, popularity: 0 },
        { followers: 10000, monthlyListeners: 20000, popularity: 42 },
    ];
    if (phase === "seed") {
        const artist = new Record(app.findCollectionByNameOrId("artists"));
        artist.set("spotifyId", id);
        app.save(artist);
        samples.forEach((metrics, index) => {
            const snapshot = new Record(
                app.findCollectionByNameOrId("snapshots")
            );
            snapshot.load({
                artist: artist.id,
                weekStart: new Date(
                    Date.UTC(2026, 0, 5 + index * 7)
                ).toISOString(),
                capturedAt: new Date(
                    Date.UTC(2026, 0, 6 + index * 7)
                ).toISOString(),
                metrics,
                source: "legacy:42",
            });
            // Test only: current validation targets the new schema; seed the old
            // schema exactly as the previously deployed code would have saved it.
            app.saveNoValidate(snapshot);
        });
        return;
    }
    const artist = app.findFirstRecordByData("artists", "spotifyId", id);
    const rows = app.findRecordsByFilter(
        "snapshots",
        "artist = {:id}",
        "weekStart",
        10,
        0,
        { id: artist.id }
    );
    assert(rows.length === samples.length, "conversion preserves row counts");
    rows.forEach((row, index) => {
        const expected = samples[index];
        assert(
            row.getString("source") === "legacy:42",
            "conversion preserves source"
        );
        assert(
            Date.parse(row.getString("capturedAt")) ===
                Date.UTC(2026, 0, 6 + index * 7),
            "conversion preserves capture time"
        );
        if (phase === "json") {
            assert(
                JSON.stringify(JSON.parse(row.getString("metrics"))) ===
                    JSON.stringify(expected),
                "rollback reconstructs nullable JSON"
            );
        } else {
            for (const key of ["followers", "monthlyListeners", "popularity"]) {
                assert(
                    row.getInt(key) === (expected[key] ?? -1),
                    "conversion preserves " + key
                );
            }
            assert(
                row.publicExport().metrics === undefined,
                "JSON column removed"
            );
        }
        if (phase === "cleanup") {
            app.delete(row);
        }
    });
    if (phase === "cleanup") {
        app.delete(artist);
    }
};
