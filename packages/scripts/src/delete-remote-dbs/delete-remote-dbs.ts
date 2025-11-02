import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFilenames } from "../utils/fs-utils";
import { getObjectKeys, listObjects, s3 } from "../utils/storage-utils";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTimerLogger, logger } from "../utils/logger";

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

    const remoteDbObjectKeys = getObjectKeys(
        await listObjects({
            bucket: BucketName.Snapshots,
            prefix: DatabaseName.PartialSnapshotPrefix,
        })
    );

    const remoteDbCount = remoteDbObjectKeys.length;
    logger.info({ remoteDbCount, ...options }, "Found remote databases");

    const remoteDbObjectKeysToDelete = remoteDbObjectKeys.filter((objectKey) =>
        localDbFilenames.includes(objectKey)
    );

    const remoteDbsToDeleteCount = remoteDbObjectKeysToDelete.length;

    logger.info(
        {
            remoteDbObjectKeysToDelete,
            remoteDbsToDeleteCount,
            ...options,
        },
        "Remote databases slated for deletion"
    );

    if (dry) {
        logger.info(
            {
                bucket,
                localDbFilenames,
                localDbCount,
                remoteDbObjectKeys,
                remoteDbCount,
                remoteDbObjectKeysToDelete,
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
            remoteDbObjectKeys,
            remoteDbCount,
            remoteDbObjectKeysToDelete,
            remoteDbsToDeleteCount,
            ...options,
        },
        "Deleting remote databases"
    );

    const { Deleted: deletedObjects } = await s3.deleteObjects({
        Bucket: BucketName.Snapshots,
        Delete: {
            Objects: remoteDbObjectKeysToDelete.map((objectKey) => ({
                Key: objectKey,
            })),
        },
    });

    const deletedObjectKeys = getObjectKeys(deletedObjects ?? []);
    const deletedCount = deletedObjectKeys.length;
    stopDeleteTimer({
        deletedObjectKeys,
        deletedCount,
        ...options,
    });
};

export type { DeleteRemoteDbsOptions };
export { deleteRemoteDbs };
