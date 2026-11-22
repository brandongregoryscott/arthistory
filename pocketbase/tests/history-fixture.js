module.exports = (app) => {
    const assert = (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    };
    const view = app.findCollectionByNameOrId("artists_with_snapshots");
    assert(
        view.type === "view" &&
            view.listRule === null &&
            view.viewRule === null,
        "history view must be private"
    );
    const artist = new Record(app.findCollectionByNameOrId("artists"));
    artist.set("spotifyId", "9999999999999999999999");
    app.save(artist);
    const list = () =>
        app.findRecordsByFilter(
            "artists_with_snapshots",
            "id = {:id}",
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
            "EXPLAIN QUERY PLAN SELECT id FROM artists_with_snapshots WHERE id > '' ORDER BY id LIMIT 500"
        )
        .all(plan);
    assert(
        plan.some(
            (row) =>
                row.detail.includes("SEARCH snapshots") &&
                row.detail.includes("snapshots_artist_week")
        ),
        "history existence must use the artist/week index"
    );
    assert(
        !plan.some((row) => row.detail.includes("SCAN snapshots")),
        "history must not scan all snapshots"
    );
    app.delete(artist);
};
