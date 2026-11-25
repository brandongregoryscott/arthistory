migrate(
    (app) => {
        // No public rules: only the owner/service superuser accesses built-in records.
        const create = (name, fields, indexes = []) => {
            const collection = new Collection({
                name,
                type: "base",
                listRule: null,
                viewRule: null,
                createRule: null,
                updateRule: null,
                deleteRule: null,
                fields: [
                    ...fields,
                    { name: "created", type: "autodate", onCreate: true },
                    {
                        name: "updated",
                        type: "autodate",
                        onCreate: true,
                        onUpdate: true,
                    },
                ],
                indexes,
            });

            app.save(collection);

            return collection;
        };

        const artists = create(
            "artists",
            [
                {
                    name: "spotifyId",
                    type: "text",
                    required: true,
                    pattern: "^[A-Za-z0-9]{22}$",
                },
                // Empty until name backfill resolves an imported ID.
                { name: "displayName", type: "text", max: 500 },
                { name: "aliases", type: "json", maxSize: 16384 },
                { name: "searchNames", type: "json", maxSize: 16384 },
                { name: "metadataSource", type: "text", max: 1000 },
                { name: "metadataUpdatedAt", type: "date" },
                { name: "syncEnabled", type: "bool" },
                { name: "nextAttemptAt", type: "date" },
                { name: "lastAttemptAt", type: "date" },
                { name: "lastSuccessAt", type: "date" },
                { name: "leaseUntil", type: "date" },
                { name: "attemptToken", type: "text", max: 100 },
            ],
            [
                "CREATE UNIQUE INDEX artists_spotify_id ON artists (spotifyId)",
                "CREATE INDEX artists_due ON artists (syncEnabled, nextAttemptAt)",
            ]
        );

        create(
            "snapshots",
            [
                {
                    name: "artist",
                    type: "relation",
                    required: true,
                    collectionId: artists.id,
                    maxSelect: 1,
                    cascadeDelete: false,
                },
                { name: "weekStart", type: "date", required: true },
                { name: "capturedAt", type: "date", required: true },
                {
                    name: "metrics",
                    type: "json",
                    required: true,
                    maxSize: 1024,
                },
                { name: "source", type: "text", required: true, max: 1000 },
            ],
            [
                "CREATE UNIQUE INDEX snapshots_artist_week ON snapshots (artist, weekStart)",
                "CREATE INDEX snapshots_week ON snapshots (weekStart)",
            ]
        );

        const settings = create(
            "sync_settings",
            [
                {
                    name: "key",
                    type: "text",
                    required: true,
                    pattern: "^global$",
                },
                { name: "enabled", type: "bool" },
                {
                    name: "maxArtistsPerTick",
                    type: "number",
                    required: true,
                    onlyInt: true,
                    min: 1,
                    max: 100,
                },
                {
                    name: "requestIntervalSeconds",
                    type: "number",
                    required: true,
                    onlyInt: true,
                    min: 5,
                    max: 86400,
                },
                {
                    name: "requestTimeoutSeconds",
                    type: "number",
                    required: true,
                    onlyInt: true,
                    min: 1,
                    max: 120,
                },
            ],
            ["CREATE UNIQUE INDEX sync_settings_key ON sync_settings (key)"]
        );
        const policy = new Record(settings);

        policy.load({
            key: "global",
            enabled: false,
            maxArtistsPerTick: 5,
            requestIntervalSeconds: 15,
            requestTimeoutSeconds: 20,
        });
        app.save(policy);

        const state = create(
            "sync_state",
            [
                {
                    name: "key",
                    type: "text",
                    required: true,
                    pattern: "^global$",
                },
                { name: "cooldownUntil", type: "date" },
                { name: "nextRequestAt", type: "date" },
                { name: "leaseUntil", type: "date" },
                { name: "attemptToken", type: "text", max: 100 },
            ],
            ["CREATE UNIQUE INDEX sync_state_key ON sync_state (key)"]
        );
        const globalState = new Record(state);

        globalState.set("key", "global");
        app.save(globalState);

        // For later bounded import batches and snapshot/success atomic writes.
        const config = app.settings();

        config.batch.enabled = true;
        config.batch.maxRequests = 100;
        config.batch.timeout = 10;
        config.batch.maxBodySize = 1024 * 1024;
        app.save(config);
    },
    (app) => {
        for (const name of [
            "sync_state",
            "sync_settings",
            "snapshots",
            "artists",
        ]) {
            app.delete(app.findCollectionByNameOrId(name));
        }

        const config = app.settings();

        config.batch.enabled = false;
        app.save(config);
    }
);
