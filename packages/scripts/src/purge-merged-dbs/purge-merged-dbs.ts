import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { listObjects, s3 } from "../utils/storage-utils";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { program } from "commander";

interface Options {
    skipConfirmation: boolean;
}

program.option(
    "--skip-confirmation",
    "Skips the confirmation prompt before deleting",
    false
);

program.parse();
const { skipConfirmation } = program.opts<Options>();

const readlineInterface = readline.createInterface({ input, output });

const main = async () => {
    const localDbFileNames = await getDbFileNames();
    console.log(`Found ${localDbFileNames.length} dbs locally`);

    const remoteDbObjects = await listObjects({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
    });

    console.log(`Found ${remoteDbObjects.length} dbs remotely`);

    const remoteDbObjectsToDelete = remoteDbObjects.filter((object) =>
        localDbFileNames.includes(object.Key ?? "")
    );

    console.log(
        `Remote dbs slated for deletion:\n${remoteDbObjectsToDelete.map((object, index) => `[${index + 1}] ${object.Key}`).join("\n")}`
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

    const label = `Deleted ${remoteDbObjectsToDelete.length} objects`;
    console.time(label);

    await s3.deleteObjects({
        Bucket: BucketName.Snapshots,
        Delete: {
            Objects: remoteDbObjectsToDelete.map((object) => ({
                Key: object.Key,
            })),
        },
    });

    console.timeEnd(label);
};

main();
