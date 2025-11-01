import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFilenames } from "../utils/fs-utils";
import { listObjects, s3 } from "../utils/storage-utils";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTimerLogger, logger } from "../utils/logger";
import { compact } from "lodash";

interface DeleteRemoteDbsOptions {
    dry: boolean;
    skipConfirmation: boolean;
}

const readlineInterface = readline.createInterface({ input, output });

const deleteRemoteDbs = async (options: DeleteRemoteDbsOptions) => {
    const { skipConfirmation, dry } = options;
    const bucket = BucketName.Snapshots;
    const localDbFilenames = await getDbFilenames();
    const localDbCount = localDbFilenames.length;
    logger.info({ localDbCount, ...options }, "Found local databases");

    const remoteDbObjects = await listObjects({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
    });

    const remoteDbCount = remoteDbObjects.length;
    logger.info({ remoteDbCount, ...options }, "Found remote databases");

    const remoteDbObjectsToDelete = remoteDbObjects.filter((object) =>
        localDbFilenames.includes(object.Key ?? "")
    );

    const remoteDbsToDeleteCount = remoteDbObjectsToDelete.length;

    logger.info(
        { remoteDbObjectsToDelete, remoteDbsToDeleteCount, ...options },
        "Remote databases slated for deletion"
    );

    if (dry) {
        logger.info(
            {
                bucket,
                localDbFilenames,
                localDbCount,
                remoteDbObjects,
                remoteDbCount,
                remoteDbObjectsToDelete,
                remoteDbsToDeleteCount,
                ...options,
            },
            "Returning early and not deleting objects from bucket"
        );
        return;
    }

    if (!skipConfirmation) {
        const answer = await readlineInterface.question(
            `Delete ${remoteDbsToDeleteCount} objects from bucket '${bucket}'? [y/N] `
        );

        if (answer.toLowerCase().trim() !== "y") {
            process.exit(0);
        }
    }

    readlineInterface.close();

    const stopDeleteTimer = createTimerLogger(
        {
            localDbFilenames,
            localDbCount,
            remoteDbObjects,
            remoteDbCount,
            remoteDbObjectsToDelete,
            remoteDbsToDeleteCount,
            ...options,
        },
        "Deleting remote databases"
    );

    const { Deleted: deletedObjects } = await s3.deleteObjects({
        Bucket: BucketName.Snapshots,
        Delete: {
            Objects: remoteDbObjectsToDelete.map((object) => ({
                Key: object.Key,
            })),
        },
    });

    const deletedObjectKeys =
        compact(deletedObjects?.map((object) => object.Key)) ?? [];
    stopDeleteTimer({
        deletedObjects: deletedObjectKeys,
        deletedCount: deletedObjectKeys.length,
        ...options,
    });
};

export type { DeleteRemoteDbsOptions };
export { deleteRemoteDbs };
