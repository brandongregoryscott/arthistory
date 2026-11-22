migrate(
    (app) => {
        const artists = app.findCollectionByNameOrId("artists");
        const songs = new Collection({
            name: "songs",
            type: "base",
            listRule: null,
            viewRule: null,
            createRule: null,
            updateRule: null,
            deleteRule: null,
            fields: [
                {
                    name: "spotifyId",
                    type: "text",
                    required: true,
                    pattern: "^[A-Za-z0-9]{22}$",
                },
                { name: "name", type: "text", required: true, max: 500 },
            ],
            indexes: [
                "CREATE UNIQUE INDEX songs_spotify_id ON songs (spotifyId)",
            ],
        });
        app.save(songs);
        app.save(
            new Collection({
                name: "song_snapshots",
                type: "base",
                listRule: null,
                viewRule: null,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    {
                        name: "song",
                        type: "relation",
                        required: true,
                        collectionId: songs.id,
                        maxSelect: 1,
                        cascadeDelete: false,
                    },
                    {
                        name: "artist",
                        type: "relation",
                        required: true,
                        collectionId: artists.id,
                        maxSelect: 1,
                        cascadeDelete: false,
                    },
                    { name: "name", type: "text", required: true, max: 500 },
                    { name: "weekStart", type: "date", required: true },
                    { name: "capturedAt", type: "date", required: true },
                    {
                        name: "listenCount",
                        type: "number",
                        min: -1,
                        max: Number.MAX_SAFE_INTEGER,
                        onlyInt: true,
                    },
                    { name: "source", type: "text", required: true, max: 1000 },
                ],
                indexes: [
                    "CREATE UNIQUE INDEX song_snapshots_artist_week_song ON song_snapshots (artist, weekStart, song)",
                    "CREATE INDEX song_snapshots_song_week ON song_snapshots (song, weekStart)",
                ],
            })
        );
    },
    (app) => {
        app.delete(app.findCollectionByNameOrId("song_snapshots"));
        app.delete(app.findCollectionByNameOrId("songs"));
    }
);
