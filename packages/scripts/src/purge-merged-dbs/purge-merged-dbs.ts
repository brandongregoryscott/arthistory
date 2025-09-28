import { PARTIAL_DB_PREFIX, BUCKET_NAME } from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { s3 } from "../utils/storage-utils";

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
};

main();
