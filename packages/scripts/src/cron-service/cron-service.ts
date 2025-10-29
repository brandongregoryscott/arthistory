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
import { purgeMergedDbs } from "../purge-merged-dbs/purge-merged-dbs";
import { getDbFileNames } from "../utils/fs-utils";
import { copyFile, rename, rm } from "node:fs/promises";
import { copyObject } from "../copy-object/copy-object";

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
    onTick: async () => {
        await downloadDbs();
        const mergedDbFilename = await mergeDbs({
            useRangeFilename: true,
            skipIndexes: true,
            skipCheckpointAsBase: false,
        });
        await uploadObject({
            filename: mergedDbFilename,
            bucket: BucketName.SnapshotBackups,
        });

        const timestamp = getRoundedTimestamp();
        const checkpointFilename = `spotify-data_${timestamp}.db`;
        // Copy the merged db from the backup bucket to the working bucket with the new checkpoint name
        await copyObject({
            sourceBucket: BucketName.SnapshotBackups,
            sourceKey: mergedDbFilename,
            targetBucket: BucketName.Snapshots,
            targetKey: checkpointFilename,
        });

        // Delete all of the remote snapshot dbs that were merged
        await purgeMergedDbs({ skipConfirmation: true });

        // Delete all of the local snapshot dbs that were merged
        const consolidatedDbFilenames = await getDbFileNames();
        await Promise.all(
            consolidatedDbFilenames.map((filename) => rm(filename))
        );

        // Rename the merged db file name to the new checkpoint file name so we don't re-download it
        await rename(mergedDbFilename, checkpointFilename);

        // Copy to the production db file path
        await copyFile(checkpointFilename, "_spotify-data.db");
    },
    start: true,
    timeZone: TIME_ZONE,
});
