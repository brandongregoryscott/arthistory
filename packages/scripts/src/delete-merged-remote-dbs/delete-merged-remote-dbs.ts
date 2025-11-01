import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFilenames } from "../utils/fs-utils";
import { listObjects, s3 } from "../utils/storage-utils";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTimerLogger, logger } from "../utils/logger";
import { compact } from "lodash";

interface DeleteMergedRemoteDbsOptions {
    dry: boolean;
    skipConfirmation: boolean;
}

const readlineInterface = readline.createInterface({ input, output });

const deleteMergedRemoteDbs = async (options: DeleteMergedRemoteDbsOptions) => {
    const { skipConfirmation, dry } = options;
    const bucket = BucketName.Snapshots;
    const localDbFilenames = await getDbFilenames();
    const localDbCount = localDbFilenames.length;
    logger.info(
        { localDbFilenameCount: localDbCount, ...options },
        "Found local databases"
    );

    const remoteDbObjects = await listObjects({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
    });

    const remoteDbCount = remoteDbObjects.length;
    logger.info({ remoteDbCount, ...options }, "Found remote databases");

    const remoteDbObjectsToDelete = remoteDbObjects.filter((object) =>
        localDbFilenames.includes(object.Key ?? "")
    );

    logger.info(
        { remoteDbObjectsToDelete, ...options },
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
                ...options,
            },
            "Returning early and not deleting objects from bucket"
        );
        return;
    }

    if (!skipConfirmation) {
        const answer = await readlineInterface.question(
            `Delete ${remoteDbObjectsToDelete.length} objects from bucket '${bucket}'? [y/N] `
        );

        if (answer.toLowerCase().trim() !== "y") {
            process.exit(0);
        }
    }

    readlineInterface.close();

    const stopDeleteTimer = createTimerLogger(
        { remoteDbCount },
        "Deleted remote databases"
    );

    const { Deleted: deletedObjects } = await s3.deleteObjects({
        Bucket: BucketName.Snapshots,
        Delete: {
            Objects: remoteDbObjectsToDelete.map((object) => ({
                Key: object.Key,
            })),
        },
    });

    stopDeleteTimer({
        deletedObjects:
            compact(deletedObjects?.map((object) => object.Key)) ?? [],
    });
};

export type { DeleteMergedRemoteDbsOptions };
export { deleteMergedRemoteDbs };
