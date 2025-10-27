import type { _Object } from "@aws-sdk/client-s3";
import {
    PARTIAL_DB_PREFIX,
    SNAPSHOT_DB_BUCKET_NAME,
} from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { downloadObjects, s3 } from "../utils/storage-utils";
import { compact } from "lodash";

const main = async () => {
    const { Contents: objects = [] } = await s3.listObjectsV2({
        Bucket: SNAPSHOT_DB_BUCKET_NAME,
        Prefix: PARTIAL_DB_PREFIX,
    });

    const localDbs = await getDbFileNames();
    const total = objects.length;
    const missingObjects = objects.filter(
        (object) => !localDbs.includes(object.Key ?? "")
    );
    const count = missingObjects.length;

    const startLabel = `Downloading ${count} partial databases (${total - count} found locally)...`;
    console.log(startLabel);

    const endLabel = `Downloaded ${count} partial databases`;
    console.time(endLabel);

    const missingObjectKeys = compact(
        missingObjects.map((object) => object.Key)
    );
    await downloadObjects(missingObjectKeys, SNAPSHOT_DB_BUCKET_NAME);

    console.timeEnd(endLabel);
};

main();
