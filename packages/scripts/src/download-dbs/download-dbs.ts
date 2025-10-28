import type { _Object } from "@aws-sdk/client-s3";
import {
    PARTIAL_DB_PREFIX,
    SNAPSHOT_DB_BUCKET_NAME,
} from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { downloadObjects, listObjects } from "../utils/storage-utils";
import { compact } from "lodash";

const downloadDbs = async () => {
    const objects = await listObjects({
        bucket: SNAPSHOT_DB_BUCKET_NAME,
        prefix: PARTIAL_DB_PREFIX,
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

export { downloadDbs };
