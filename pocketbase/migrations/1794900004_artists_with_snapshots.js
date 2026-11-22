migrate(
    (app) => {
        // Indexed existence checks avoid a large reverse-relation join. This is
        // derived metadata: no duplicated records or history counters to repair.
        app.save(
            new Collection({
                name: "artists_with_snapshots",
                type: "view",
                listRule: null,
                viewRule: null,
                viewQuery: `SELECT artists.id AS id FROM artists
                WHERE EXISTS (SELECT 1 FROM snapshots WHERE snapshots.artist = artists.id)`,
            })
        );
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId("artists_with_snapshots"));
    }
);
