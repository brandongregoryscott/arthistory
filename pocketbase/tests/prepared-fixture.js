// Test-only compatibility/measurement command. Never included in deployment hooks.
module.exports = (app, items, command) => {
    const load = () => {
        for (let start = 0; start < items.length; start += 50) {
            app.runInTransaction((tx) => {
                for (const item of items.slice(start, start + 50)) {
                    const existing = tx.findRecordsByFilter(
                        item.collection,
                        "id = {:id}",
                        "",
                        1,
                        0,
                        { id: item.record.id }
                    );

                    if (existing.length !== 0) {
                        continue;
                    }

                    const row = new Record(
                        tx.findCollectionByNameOrId(item.collection)
                    );
                    row.load(item.record);
                    tx.save(row);
                }
            });
        }
    };

    load();
    load();

    for (const collection of ["artists", "snapshots"]) {
        const expected = items.filter(
            (item) => item.collection === collection
        ).length;

        if (app.countRecords(collection) !== expected) {
            throw new Error("Prepared fixture count mismatch.");
        }
    }

    const withHistory = app.findRecordsByFilter(
        "artists_with_snapshots",
        "id != ''",
        "id",
        500,
        0
    );
    const artistIds = new Set(
        items
            .filter((item) => item.collection === "snapshots")
            .map((item) => item.record.artist)
    );

    if (withHistory.length !== artistIds.size) {
        throw new Error("History view must return one row per artist.");
    }

    for (const item of items.filter(
        (item) => item.collection === "snapshots"
    )) {
        const stored = app.findRecordById("snapshots", item.record.id);

        if (
            ["followers", "monthlyListeners", "popularity"].some(
                (key) => stored.getInt(key) !== item.record[key]
            )
        ) {
            throw new Error("Prepared metrics failed the native roundtrip.");
        }
    }

    const sizes = arrayOf(new DynamicModel({ bytes: 0, name: "" }));
    app.db()
        .newQuery(
            "SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name ORDER BY name"
        )
        .all(sizes);
    const started = Date.now();
    app.createBackup(command.context(), "prepared-fixture.zip");
    const backupMs = Date.now() - started;
    const tableBytes = sizes
        .filter((row) => ["artists", "snapshots"].includes(row.name))
        .reduce((total, row) => total + row.bytes, 0);
    const indexBytes = sizes
        .filter(
            (row) =>
                row.name.startsWith("artists_") ||
                row.name.startsWith("snapshots_") ||
                row.name.startsWith("sqlite_autoindex_artists_") ||
                row.name.startsWith("sqlite_autoindex_snapshots_")
        )
        .reduce((total, row) => total + row.bytes, 0);
    command.println(
        "PREPARED_METRICS " +
            JSON.stringify({
                artists: app.countRecords("artists"),
                snapshots: app.countRecords("snapshots"),
                backupMs,
                tableBytes,
                indexBytes,
            })
    );
};
