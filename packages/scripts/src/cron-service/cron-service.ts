import { CronJob } from "cron";
import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "../sync/sync";
import { getSnapshotDbFilename } from "../utils/db-utils";
import { uploadObject } from "../upload-object/upload-object";
import { BucketName, DatabaseName } from "../constants/storage";
import { existsSync } from "node:fs";
import { downloadObject } from "../download-object/download-object";

const TIME_ZONE = "America/New_York";

CronJob.from({
    cronTime: "34 * * * *",
    onTick: async () => {
        if (!existsSync(DatabaseName.ArtistIds)) {
            await downloadObject({
                key: DatabaseName.ArtistIds,
                bucket: BucketName.Snapshots,
            });
        }

        const timestamp = getRoundedTimestamp();
        const dbFilename = getSnapshotDbFilename(timestamp);
        await sync({ timestamp });
        await uploadObject({
            filename: dbFilename,
            bucket: BucketName.Snapshots,
        });
    },
    start: true,
    timeZone: TIME_ZONE,
});

CronJob.from({
    // This can be reduced once we know it works
    cronTime: "0 0 * * *",
    onTick: async () => {},
    start: true,
    timeZone: TIME_ZONE,
});
