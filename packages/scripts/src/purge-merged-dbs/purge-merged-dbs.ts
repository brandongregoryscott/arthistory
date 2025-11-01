import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { listObjects, s3 } from "../utils/storage-utils";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTimerLogger, logger } from "../utils/logger";

interface PurgeMergedDbsOptions {
    skipConfirmation: boolean;
}

const readlineInterface = readline.createInterface({ input, output });

const purgeMergedDbs = async (options: PurgeMergedDbsOptions) => {
    const { skipConfirmation } = options;
    const localDbFilenames = await getDbFileNames();
    logger.info(
        { localDbFilenameCount: localDbFilenames.length },
        "Found local databases"
    );

    const remoteDbObjects = await listObjects({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
    });

    const remoteDbCount = remoteDbObjects.length;
    logger.info({ remoteDbCount }, "Found remote databases");

    const remoteDbObjectsToDelete = remoteDbObjects.filter((object) =>
        localDbFilenames.includes(object.Key ?? "")
    );

    logger.info(
        { remoteDbObjectsToDelete },
        "Remote databases slated for deletion"
    );

    if (!skipConfirmation) {
        const answer = await readlineInterface.question(
            `Delete ${remoteDbObjectsToDelete.length} objects from bucket '${BucketName.Snapshots}'? [y/N] `
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

    await s3.deleteObjects({
        Bucket: BucketName.Snapshots,
        Delete: {
            Objects: remoteDbObjectsToDelete.map((object) => ({
                Key: object.Key,
            })),
        },
    });

    stopDeleteTimer();
};

export type { PurgeMergedDbsOptions };
export { purgeMergedDbs };
