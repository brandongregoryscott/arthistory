migrate(
    (app) => {
        const collection = app.findCollectionByNameOrId("snapshots");
        collection.fields.add(
            new JSONField({ name: "songs", maxSize: 2 * 1024 * 1024 })
        );
        app.save(collection);
    },
    (app) => {
        const collection = app.findCollectionByNameOrId("snapshots");
        collection.fields.removeByName("songs");
        app.save(collection);
    }
);
