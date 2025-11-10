import { CronJob } from "cron";
import { getRoundedTimestamp } from "../utils/date-utils";
import { sync } from "../sync/sync";
import { getSnapshotDbFilename } from "../utils/db-utils";
import { uploadObject } from "../upload-object/upload-object";
import { BucketName, DatabaseName } from "../constants/storage";
import { existsSync } from "node:fs";
import { downloadObject } from "../utils/storage-utils";
import { downloadDbs } from "../download-dbs/download-dbs";
import { mergeDbs } from "../merge-dbs/merge-dbs";
import { deleteLocalDbs } from "../delete-local-dbs/delete-local-dbs";
import { deleteRemoteDbs } from "../delete-remote-dbs/delete-remote-dbs";
import { rename } from "node:fs/promises";

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
                key: DatabaseName.ArtistIds,
                bucket: BucketName.ArtistIds,
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
            filename: mergedDbFilename,
            bucket: BucketName.SnapshotBackups,
        });
        await deleteRemoteDbs({ dry: false, skipConfirmation: true });
        await deleteLocalDbs({ dry: false, skipConfirmation: true });

        // Once we have deleted the merged dbs locally and remotely, use this merged version as the new checkpoint/base
        await rename(mergedDbFilename, dbFilename);
    },
    start: true,
    timeZone: TIME_ZONE,
});
