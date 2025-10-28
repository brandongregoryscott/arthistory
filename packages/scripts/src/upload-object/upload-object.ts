import { existsSync } from "node:fs";
import { logUploadProgress, s3 } from "../utils/storage-utils";
import { createReadStream } from "node:fs";
import { Upload } from "@aws-sdk/lib-storage";

/**
 * Upload parts 50 MB at a time to reduce API usage
 */
const PART_SIZE = 50 * Math.pow(1024, 2);

interface UploadObjectOptions {
    bucket: string;
    filename: string;
}

const uploadObject = async (options: UploadObjectOptions) => {
    const { filename, bucket } = options;
    if (!existsSync(filename)) {
        console.error(`File '${filename}' not found.`);
        process.exit(1);
    }

    console.log(`Starting upload for '${filename}'...`);
    const label = `Uploaded '${filename}'`;
    console.time(label);
    const readStream = createReadStream(filename);

    const upload = new Upload({
        client: s3,
        partSize: PART_SIZE,
        params: {
            Bucket: bucket,
            Key: filename,
            Body: readStream,
        },
    });

    upload.on("httpUploadProgress", logUploadProgress);

    await upload.done();
    console.timeEnd(label);
};

export type { UploadObjectOptions };
export { uploadObject };
