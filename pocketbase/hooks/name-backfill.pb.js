cronAdd("artist-name-backfill", "* * * * *", () => {
    const job = require(__hooks + "/name-backfill.js");
    try {
        const result = job.tick($app, {
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
                "Artist name backfill",
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
            "Artist name backfill failed; persisted reservation retained for recovery"
        );
    }
});
