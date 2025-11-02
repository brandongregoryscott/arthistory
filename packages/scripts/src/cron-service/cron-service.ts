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

const TIME_ZONE = "America/New_York";

CronJob.from({
    cronTime: "34 * * * *",
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
    // This can be reduced once we know it works
    cronTime: "0 0 * * *",
    onTick: async () => {
        await downloadDbs();
        const timestamp = getRoundedTimestamp();
        const dbFilename = `merged-${DatabaseName.PartialSnapshotPrefix}${timestamp}.db`;
        await mergeDbs({
            filename: dbFilename,
            skipCheckpointAsBase: false,
            skipIndexes: true,
        });
        await uploadObject({
            filename: dbFilename,
            bucket: BucketName.SnapshotBackups,
        });
        await deleteLocalDbs({ dry: true, skipConfirmation: true });
        await deleteRemoteDbs({ dry: true, skipConfirmation: true });
    },
    start: true,
    timeZone: TIME_ZONE,
});
