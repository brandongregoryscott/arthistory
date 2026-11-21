cronAdd("artist-sync", "* * * * *", () => {
    const job = require(__hooks + "/artist-sync.js");
    try {
        const result = job.scheduled($app, {
            now: () => Date.now(),
            token: () => $security.randomString(32),
            readPage: (id, timeoutSeconds) =>
                require(__hooks + "/artist-page-http.js").readArtistName({
                    id,
                    timeoutSeconds,
                    now: () => Date.now(),
                    execute: (args) =>
                        toString($os.cmd("curl", ...args).output()),
                }),
        });
        if (result.status !== "idle") {
            $app.logger().info(
                "Artist sync",
                "status",
                result.status,
                "artistId",
                result.artistId,
                "httpStatus",
                result.httpStatus,
                "coverage",
                job.coverage($app)
            );
        }
    } catch (_) {
        $app.logger().error(
            "Artist sync failed; persisted reservation retained for recovery"
        );
    }
});

onRecordUpdateRequest((e) => {
    require(__hooks + "/artist-sync.js").stampOwnerName(e.record, Date.now());
    return e.next();
}, "artists");

onBootstrap((e) => {
    e.next();
    if (!$os.args.includes("serve")) {
        return;
    }
    const settings = $app.findFirstRecordByData(
        "sync_settings",
        "key",
        "global"
    );
    const due = $app.findRecordsByFilter(
        "artists",
        "syncEnabled = true && (nextAttemptAt = '' || nextAttemptAt <= {:now})",
        "nextAttemptAt,id",
        1,
        0,
        { now: new Date().toISOString().replace("T", " ") }
    );
    $app.logger().info(
        "Artist jobs ready",
        "collectionEnabled",
        settings.getBool("enabled"),
        "dueSnapshots",
        due.length > 0
    );
});
