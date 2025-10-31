import { createTimerLogger } from "../utils/logger";
import type { DownloadObjectOptions } from "../utils/storage-utils";
import { downloadObject as _downloadObject } from "../utils/storage-utils";

const downloadObject = async (options: DownloadObjectOptions) => {
    const { key, bucket } = options;

    const stopDownloadTimer = createTimerLogger(
        { key, bucket },
        "Downloading object"
    );

    await _downloadObject({ key, bucket });

    stopDownloadTimer();
};

export { downloadObject };
