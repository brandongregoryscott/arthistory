module.exports = (app, command, phasePath) => {
    const assert = (value, message) => {
        if (!value) {
            throw new Error(message);
        }
    };
    const ID = "6lcwlkAjBPSKnFBZjjZFJs";
    let phase = "";
    try {
        phase = toString($os.readFile(phasePath));
    } catch (_) {}
    const file = app.dataDir() + "/storage/restore-fixture.txt";
    if (phase === "restoring") {
        const artist = app.findFirstRecordByData("artists", "spotifyId", ID);
        assert(
            artist.getString("displayName") === "Before backup" &&
                !artist.getBool("syncEnabled"),
            "artist and enrollment restored"
        );
        assert(
            app.countRecords("artists") === 1 &&
                app.countRecords("snapshots") === 1,
            "restored record counts"
        );
        const [snapshot] = app.findAllRecords("snapshots");
        assert(snapshot.getInt("followers") === -1, "restored null metrics");
        assert(
            toString($os.readFile(file)) === "original asset",
            "restored storage file"
        );
        assert(
            !app
                .findFirstRecordByData("sync_settings", "key", "global")
                .getBool("enabled"),
            "restored collection remains disabled"
        );
        $os.writeFile(phasePath, "verified", 384);
        return;
    }
    const artist = new Record(app.findCollectionByNameOrId("artists"));
    artist.set("spotifyId", ID);
    artist.set("displayName", "Before backup");
    app.save(artist);
    const snapshot = new Record(app.findCollectionByNameOrId("snapshots"));
    snapshot.load({
        artist: artist.id,
        weekStart: "2026-01-05 00:00:00.000Z",
        capturedAt: "2026-01-07 12:00:00.000Z",
        followers: -1,
        monthlyListeners: 100,
        popularity: -1,
        source: "restore-fixture",
    });
    app.save(snapshot);
    $os.mkdirAll(app.dataDir() + "/storage", 448);
    $os.writeFile(file, "original asset", 384);
    app.createBackup(command.context(), "restore-fixture.zip");
    artist.set("displayName", "After backup");
    app.save(artist);
    snapshot.set("followers", 42);
    snapshot.set("monthlyListeners", -1);
    snapshot.set("popularity", -1);
    app.save(snapshot);
    const extra = new Record(app.findCollectionByNameOrId("artists"));
    extra.set("spotifyId", "5AyEXCtu3xnnsTGCo4RVZh");
    app.save(extra);
    $os.writeFile(file, "changed asset", 384);
    $os.writeFile(phasePath, "restoring", 384);
    app.restoreBackup(command.context(), "restore-fixture.zip");
};
