import type { _Object } from "@aws-sdk/client-s3";
import { compact } from "lodash";
import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFilenames } from "../utils/fs-utils";
import { createTimerLogger } from "../utils/logger";
import { downloadObjects, listObjects } from "../utils/storage-utils";

const downloadDbs = async () => {
    const objects = await listObjects({
        bucket: BucketName.Snapshots,
        prefix: DatabaseName.PartialSnapshotPrefix,
    });

    const localDbs = await getDbFilenames();
    const total = objects.length;
    const missingObjects = objects.filter(
        (object) => !localDbs.includes(object.Key ?? "")
    );
    const count = missingObjects.length;

    const stopDownloadTimer = createTimerLogger(
        { count, localCount: total - count, total },
        "Downloading partial databases"
    );

    const missingObjectKeys = compact(
        missingObjects.map((object) => object.Key)
    );
    await downloadObjects({
        bucket: BucketName.Snapshots,
        keys: missingObjectKeys,
    });

    stopDownloadTimer();
};

export { downloadDbs };
