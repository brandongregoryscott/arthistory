// PocketBase owns this schema change and runs each migration in a transaction.
// Use SQL inside PocketBase to convert all rows without loading history into RAM.
migrate(
    (app) => {
        // Freeze the historical sentinel independently of application code.
        const MISSING_METRIC = -1;
        const collection = app.findCollectionByNameOrId("snapshots");
        for (const name of ["followers", "monthlyListeners", "popularity"]) {
            collection.fields.add(
                new NumberField({
                    name,
                    min: MISSING_METRIC,
                    max: name === "popularity" ? 100 : Number.MAX_SAFE_INTEGER,
                    onlyInt: true,
                })
            );
        }
        app.save(collection);
        app.db()
            .newQuery(
                `
            UPDATE snapshots SET
                followers = COALESCE(json_extract(metrics, '$.followers'), ${MISSING_METRIC}),
                monthlyListeners = COALESCE(json_extract(metrics, '$.monthlyListeners'), ${MISSING_METRIC}),
                popularity = COALESCE(json_extract(metrics, '$.popularity'), ${MISSING_METRIC})
        `
            )
            .execute();
        collection.fields.removeByName("metrics");
        app.save(collection);
    },
    (app) => {
        // Freeze the historical sentinel independently of application code.
        const MISSING_METRIC = -1;
        const collection = app.findCollectionByNameOrId("snapshots");
        collection.fields.add(
            new JSONField({ name: "metrics", required: true, maxSize: 1024 })
        );
        app.save(collection);
        app.db()
            .newQuery(
                `
            UPDATE snapshots SET metrics = json_object(
                'followers', NULLIF(followers, ${MISSING_METRIC}),
                'monthlyListeners', NULLIF(monthlyListeners, ${MISSING_METRIC}),
                'popularity', NULLIF(popularity, ${MISSING_METRIC})
            )
        `
            )
            .execute();
        for (const name of ["followers", "monthlyListeners", "popularity"]) {
            collection.fields.removeByName(name);
        }
        app.save(collection);
    }
);
