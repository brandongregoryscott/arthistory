import type { DownloadObjectOptions } from "../utils/storage-utils";
import { downloadObject as _downloadObject } from "../utils/storage-utils";

const downloadObject = async (options: DownloadObjectOptions) => {
    const { key, bucket } = options;
    console.log(`Downloading '${key}'...`);

    const label = `Downloaded '${key}'`;
    console.time(label);

    await _downloadObject({ key, bucket });

    console.timeEnd(label);
};

export { downloadObject };
