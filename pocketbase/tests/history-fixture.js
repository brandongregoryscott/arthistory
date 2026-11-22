module.exports = (app) => {
    const assert = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    const artist = new Record(app.findCollectionByNameOrId("artists"));
    artist.set("spotifyId", "9999999999999999999999");
    app.save(artist);
    const list = () =>
        app.findRecordsByFilter(
            "artists",
            "id = {:id} && snapshots_via_artist.artist ?!= ''",
            "id",
            500,
            0,
            {
                id: artist.id,
            }
        );
    assert(list().length === 0, "artist without history must be absent");
    const create = (week) => {
        const row = new Record(app.findCollectionByNameOrId("snapshots"));
        row.load({
            artist: artist.id,
            weekStart: week,
            capturedAt: week,
            followers: -1,
            popularity: 0,
            monthlyListeners: -1,
            source: "history-fixture",
        });
        app.save(row);
        return row;
    };
    const first = create("2026-01-05 00:00:00.000Z");
    const second = create("2026-01-12 00:00:00.000Z");
    assert(list().length === 1, "multiple snapshots must yield one artist");
    app.delete(first);
    assert(list().length === 1, "remaining snapshot preserves history");
    app.delete(second);
    assert(list().length === 0, "deleting last snapshot removes history");
    const plan = arrayOf(
        new DynamicModel({ id: 0, parent: 0, notused: 0, detail: "" })
    );
    app.db()
        .newQuery(
            // SQL emitted by PocketBase 0.40.6 for the history filter. The any
            // operator avoids its extra all-related-records subquery.
            `EXPLAIN QUERY PLAN SELECT DISTINCT artists.* FROM artists
            LEFT JOIN snapshots history ON history.artist = artists.id
            WHERE artists.id > '' AND history.artist IS NOT '' AND history.artist IS NOT NULL
            ORDER BY artists.id LIMIT 500`
        )
        .all(plan);
    assert(
        plan.some(
            (row) =>
                row.detail.includes("SEARCH history") &&
                row.detail.includes("COVERING INDEX snapshots_artist_week")
        ),
        "history existence must use the artist/week index"
    );
    assert(
        !plan.some(
            (row) =>
                row.detail.includes("SCAN history") ||
                row.detail.includes("CORRELATED")
        ),
        "history must not scan all snapshots or add an all-records subquery"
    );
    app.delete(artist);
};
