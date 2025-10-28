import { CronJob } from "cron";
import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "../sync/sync";
import { getSnapshotDbFilename } from "../utils/db-utils";
import { uploadDb } from "../upload-db/upload-db";
import {
    ARTIST_IDS_DB_NAME,
    SNAPSHOT_DB_BACKUP_BUCKET_NAME,
    SNAPSHOT_DB_BUCKET_NAME,
} from "../constants/storage";
import { existsSync } from "node:fs";
import { downloadObject } from "../utils/storage-utils";
import { downloadDbs } from "../download-dbs/download-dbs";
import { mergeDbs } from "../merge-dbs/merge-dbs";

const TIME_ZONE = "America/New_York";

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
    timeZone: TIME_ZONE,
});

CronJob.from({
    // This can be reduced once we know it works
    cronTime: "0 0 * * *",
    onTick: async () => {
        await downloadDbs();
        const mergedDbFilename = await mergeDbs({
            useRangeFilename: true,
            skipIndexes: true,
            skipCheckpointAsBase: false,
        });
        await uploadDb({
            filename: mergedDbFilename,
            bucket: SNAPSHOT_DB_BACKUP_BUCKET_NAME,
        });

        // TODO: Once we've determined the merge/upload is working correctly, we can refactor the `purge-merged-dbs` script and call it here.
    },
    start: true,
    timeZone: TIME_ZONE,
});
