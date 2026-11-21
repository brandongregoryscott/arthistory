migrate(
    (app) => {
        const collection = app.findCollectionByNameOrId("snapshots");
        collection.addIndex("snapshots_capture", false, "capturedAt", "");
        app.save(collection);
    },
    (app) => {
        const collection = app.findCollectionByNameOrId("snapshots");
        collection.removeIndex("snapshots_capture");
        app.save(collection);
    }
);
