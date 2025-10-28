import { downloadObject } from "../utils/storage-utils";

interface DownloadDbOptions {
    bucket: string;
    key: string;
}

const downloadDb = async (options: DownloadDbOptions) => {
    const { key, bucket } = options;
    console.log(`Downloading '${key}'...`);

    const label = `Downloaded '${key}'`;
    console.time(label);

    await downloadObject({ key, bucket });

    console.timeEnd(label);
};

export type { DownloadDbOptions };
export { downloadDb };
