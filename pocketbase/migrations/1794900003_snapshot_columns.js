// PocketBase owns this schema change and runs each migration in a transaction.
// Use SQL inside PocketBase to convert all rows without loading history into RAM.
migrate(
    (app) => {
        const collection = app.findCollectionByNameOrId("snapshots");
        for (const name of ["followers", "monthlyListeners", "popularity"]) {
            collection.fields.add(
                new NumberField({
                    name,
                    min: -1,
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
                followers = COALESCE(json_extract(metrics, '$.followers'), -1),
                monthlyListeners = COALESCE(json_extract(metrics, '$.monthlyListeners'), -1),
                popularity = COALESCE(json_extract(metrics, '$.popularity'), -1)
        `
            )
            .execute();
        collection.fields.removeByName("metrics");
        app.save(collection);
    },
    (app) => {
        const collection = app.findCollectionByNameOrId("snapshots");
        collection.fields.add(
            new JSONField({ name: "metrics", required: true, maxSize: 1024 })
        );
        app.save(collection);
        app.db()
            .newQuery(
                `
            UPDATE snapshots SET metrics = json_object(
                'followers', NULLIF(followers, -1),
                'monthlyListeners', NULLIF(monthlyListeners, -1),
                'popularity', NULLIF(popularity, -1)
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
