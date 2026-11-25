migrate(
    (app) => {
        const settings = app.findCollectionByNameOrId("sync_settings");

        settings.fields.add(new BoolField({ name: "namesBackfillEnabled" }));
        app.save(settings);

        const artists = app.findCollectionByNameOrId("artists");

        artists.fields.add(new DateField({ name: "metadataNextAttemptAt" }));
        artists.addIndex(
            "artists_names_due",
            false,
            "metadataNextAttemptAt, id",
            "displayName = ''"
        );
        app.save(artists);
    },
    (app) => {
        const artists = app.findCollectionByNameOrId("artists");

        artists.removeIndex("artists_names_due");
        artists.fields.removeByName("metadataNextAttemptAt");
        app.save(artists);

        const settings = app.findCollectionByNameOrId("sync_settings");

        settings.fields.removeByName("namesBackfillEnabled");
        app.save(settings);
    }
);
