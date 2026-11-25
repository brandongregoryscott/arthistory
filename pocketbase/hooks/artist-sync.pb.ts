import type * as ArtistPageHttp from "./artist-page-http.js";
import type * as ArtistSync from "./artist-sync.js";

cronAdd("artist-sync", "* * * * *", () => {
    const job = require(__hooks + "/artist-sync.js") as typeof ArtistSync;
    try {
        const result = job.scheduled($app as unknown as ArtistSync.SyncApp, {
            now: () => Date.now(),
            readPage: (id, timeoutSeconds) =>
                (
                    require(
                        __hooks + "/artist-page-http.js"
                    ) as typeof ArtistPageHttp
                ).readArtistName({
                    execute: (args) =>
                        toString($os.cmd("curl", ...args).output()),
                    id,
                    now: () => Date.now(),
                    timeoutSeconds,
                }),
            token: () => $security.randomString(32),
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
                job.coverage($app as unknown as ArtistSync.SyncApp)
            );
        }
    } catch (_) {
        $app.logger().error(
            "Artist sync failed; persisted reservation retained for recovery"
        );
    }
});

onRecordUpdateRequest((e) => {
    (require(__hooks + "/artist-sync.js") as typeof ArtistSync).stampOwnerName(
        e.record as core.Record,
        Date.now()
    );
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
