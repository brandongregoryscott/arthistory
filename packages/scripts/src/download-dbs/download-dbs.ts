import type { _Object } from "@aws-sdk/client-s3";
import { BucketName, DatabaseName } from "../constants/storage";
import { getDbFileNames } from "../utils/fs-utils";
import { downloadObjects, listObjects } from "../utils/storage-utils";
import { compact } from "lodash";
import { createTimerLogger } from "../utils/logger";

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

    const stopDownloadTimer = createTimerLogger(
        { count, total, localCount: total - count },
        "Downloading partial databases"
    );

    const missingObjectKeys = compact(
        missingObjects.map((object) => object.Key)
    );
    await downloadObjects({
        keys: missingObjectKeys,
        bucket: BucketName.Snapshots,
    });

    stopDownloadTimer();
};

export { downloadDbs };
