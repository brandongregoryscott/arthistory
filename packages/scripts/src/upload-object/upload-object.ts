import { Upload } from "@aws-sdk/lib-storage";
import { existsSync, createReadStream } from "node:fs";
import { createTimerLogger, logger } from "../utils/logger";
import { logUploadProgress, s3 } from "../utils/storage-utils";

/**
 * Upload parts 50 MB at a time to reduce API usage
 */
const PART_SIZE = 50 * Math.pow(1024, 2);

type UploadObjectOptions = {
    bucket: string;
    filename: string;
    key?: string;
};

const uploadObject = async (options: UploadObjectOptions) => {
    const { bucket, filename, key } = options;
    if (!existsSync(filename)) {
        logger.error({ bucket, filename, key }, "File not found on filesystem");
        process.exit(1);
    }

    const stopUploadTimer = createTimerLogger(
        { bucket, filename, key },
        "Uploading file"
    );
    const readStream = createReadStream(filename);

    const upload = new Upload({
        client: s3,
        params: {
            Body: readStream,
            Bucket: bucket,
            Key: key ?? filename,
        },
        partSize: PART_SIZE,
    });

    upload.on("httpUploadProgress", logUploadProgress);

    await upload.done();
    stopUploadTimer();
};

export type { UploadObjectOptions };
export { uploadObject };
