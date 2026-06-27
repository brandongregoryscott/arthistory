import { CronJob } from "cron";
import { existsSync } from "node:fs";
import { rename } from "node:fs/promises";
import { BucketName, DatabaseName } from "../constants/storage";
import { deleteLocalDbs } from "../delete-local-dbs/delete-local-dbs";
import { deleteRemoteDbs } from "../delete-remote-dbs/delete-remote-dbs";
import { downloadDbs } from "../download-dbs/download-dbs";
import { mergeDbs } from "../merge-dbs/merge-dbs";
import { sync } from "../sync/sync";
import { uploadObject } from "../upload-object/upload-object";
import { getRoundedTimestamp } from "../utils/date-utils";
import { getSnapshotDbFilename } from "../utils/db-utils";
import { downloadObject } from "../utils/storage-utils";

console.log("Starting cron service...");

const TIME_ZONE = "America/New_York";

/**
 * @see https://crontab.guru/#34_*_*_*_*
 */
const SYNC_CRON_TIME = "34 * * * *";

/**
 * @see https://crontab.guru/#0_0_*_*_0
 */
const MERGE_AND_BACKUP_CRON_TIME = "0 0 * * 0";

CronJob.from({
    cronTime: SYNC_CRON_TIME,
    onTick: async () => {
        if (!existsSync(DatabaseName.ArtistIds)) {
            await downloadObject({
                bucket: BucketName.ArtistIds,
                key: DatabaseName.ArtistIds,
            });
        }

        const timestamp = getRoundedTimestamp();
        const dbFilename = getSnapshotDbFilename(timestamp);
        await sync({ timestamp });
        await uploadObject({
            bucket: BucketName.Snapshots,
            filename: dbFilename,
        });
    },
    start: true,
    timeZone: TIME_ZONE,
});

CronJob.from({
    cronTime: MERGE_AND_BACKUP_CRON_TIME,
    onTick: async () => {
        await downloadDbs();
        const timestamp = getRoundedTimestamp();
        const dbFilename = getSnapshotDbFilename(timestamp);
        const mergedDbFilename = `merged-${dbFilename}`;
        await mergeDbs({
            filename: mergedDbFilename,
            skipCheckpointAsBase: false,
            skipIndexes: true,
        });
        await uploadObject({
            bucket: BucketName.SnapshotBackups,
            filename: mergedDbFilename,
        });
        await deleteRemoteDbs({ dry: false, skipConfirmation: true });
        await deleteLocalDbs({ dry: false, skipConfirmation: true });

        // Once we have deleted the merged dbs locally and remotely, use this merged version as the new checkpoint/base
        await rename(mergedDbFilename, dbFilename);
    },
    start: true,
    timeZone: TIME_ZONE,
});
