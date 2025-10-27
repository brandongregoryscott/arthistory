import { CronJob } from "cron";
import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "../sync/sync";
import { getSnapshotDbFilename } from "../utils/db-utils";
import { uploadDb } from "../upload-db/upload-db";
import {
    ARTIST_IDS_DB_NAME,
    SNAPSHOT_DB_BUCKET_NAME,
} from "../constants/storage";
import { existsSync } from "node:fs";
import { downloadObject } from "../utils/storage-utils";

CronJob.from({
    cronTime: "34 * * * *",
    onTick: async () => {
        if (!existsSync(ARTIST_IDS_DB_NAME)) {
            await downloadObject(ARTIST_IDS_DB_NAME, SNAPSHOT_DB_BUCKET_NAME);
        }

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
