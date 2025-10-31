import { existsSync } from "node:fs";
import { logUploadProgress, s3 } from "../utils/storage-utils";
import { createReadStream } from "node:fs";
import { Upload } from "@aws-sdk/lib-storage";
import { createTimerLogger, logger } from "../utils/logger";

/**
 * Upload parts 50 MB at a time to reduce API usage
 */
const PART_SIZE = 50 * Math.pow(1024, 2);

interface UploadObjectOptions {
    bucket: string;
    filename: string;
    key?: string;
}

const uploadObject = async (options: UploadObjectOptions) => {
    const { filename, bucket, key } = options;
    if (!existsSync(filename)) {
        logger.error({ filename }, "File not found on filesystem");
        process.exit(1);
    }

    const stopUploadTimer = createTimerLogger(
        { filename, key, bucket },
        "Uploading file"
    );
    const readStream = createReadStream(filename);

    const upload = new Upload({
        client: s3,
        partSize: PART_SIZE,
        params: {
            Bucket: bucket,
            Key: key ?? filename,
            Body: readStream,
        },
    });

    upload.on("httpUploadProgress", logUploadProgress);

    await upload.done();
    stopUploadTimer();
};

export type { UploadObjectOptions };
export { uploadObject };
