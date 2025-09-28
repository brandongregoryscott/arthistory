import { PARTIAL_DB_PREFIX, BUCKET_NAME } from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { s3 } from "../utils/storage-utils";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const readlineInterface = readline.createInterface({ input, output });

const main = async () => {
    const localDbFileNames = await getDbFileNames();
    console.log(`Found ${localDbFileNames.length} dbs locally`);

    const { Contents: remoteDbObjects = [] } = await s3.listObjectsV2({
        Bucket: BUCKET_NAME,
        Prefix: PARTIAL_DB_PREFIX,
    });

    console.log(`Found ${remoteDbObjects.length} dbs remotely`);

    const remoteDbObjectsToDelete = remoteDbObjects.filter((object) =>
        localDbFileNames.includes(object.Key ?? "")
    );

    console.log(
        `Remote dbs slated for deletion:\n${remoteDbObjectsToDelete.map((object) => object.Key).join("\n")}`
    );

    const answer = await readlineInterface.question(
        `Delete ${remoteDbObjectsToDelete.length} objects from bucket '${BUCKET_NAME}'? [y/N] `
    );

    if (answer.toLowerCase().trim() !== "y") {
        process.exit(0);
    }

    readlineInterface.close();

    const label = `Deleted ${remoteDbObjectsToDelete.length} objects`;
    console.time(label);

    await s3.deleteObjects({
        Bucket: BUCKET_NAME,
        Delete: {
            Objects: remoteDbObjects.map((object) => ({ Key: object.Key })),
        },
    });

    console.timeEnd(label);
};

main();
