import { CronJob } from "cron";
import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "../sync/sync";
import { getSnapshotDbFilename } from "../utils/db-utils";
import { uploadDb } from "../upload-db/upload-db";
import { SNAPSHOT_DB_BUCKET_NAME } from "../constants/storage";

CronJob.from({
    cronTime: "34 * * * *",
    onTick: async () => {
        const timestamp = getRoundedTimestamp();
        const dbFilename = getSnapshotDbFilename(timestamp);
        await sync({ timestamp });
        await uploadDb({
            filename: dbFilename,
            bucket: SNAPSHOT_DB_BUCKET_NAME,
        });
    },
    start: true,
    timeZone: "America/New_York",
});
