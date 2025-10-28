import type { _Object } from "@aws-sdk/client-s3";
import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { downloadObjects, listObjects } from "../utils/storage-utils";
import { compact } from "lodash";

const downloadDbs = async () => {
    const objects = await listObjects({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
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
    await downloadObjects(missingObjectKeys, BucketName.Snapshots);

    console.timeEnd(endLabel);
};

export { downloadDbs };
