import { createTimerLogger } from "../utils/logger";
import { logUploadProgress, s3 } from "../utils/storage-utils";
import { Upload } from "@aws-sdk/lib-storage";

interface CopyObjectOptions {
    sourceBucket: string;
    sourceKey: string;
    targetBucket: string;
    targetKey: string;
}

/**
 * Upload parts 50 MB at a time to reduce API usage
 */
const PART_SIZE = 50 * Math.pow(1024, 2);

/**
 * The maximum size of an object that can be copied using the `CopyObject` endpoint is 5 GB. Files
 * larger than that will need to be streamed + uploaded using the multi-part upload API, which is slower.
 * Let's support both for now, since the files are currently < 5 GB, but will likely grow past it in the future.
 */
const MAX_COPY_OBJECT_SIZE_IN_BYTES = 5 * Math.pow(1024, 3);

const copyObject = async (options: CopyObjectOptions) => {
    const { sourceKey, targetKey, sourceBucket, targetBucket } = options;
    const copySource = `${sourceBucket}/${sourceKey}`;
    const target = `${targetBucket}/${targetKey}`;

    const stopCopyTimer = createTimerLogger(
        { copySource, target },
        "Copying object"
    );

    const { ContentLength: size } = await s3.headObject({
        Key: sourceKey,
        Bucket: sourceBucket,
    });

    if (size !== undefined && size < MAX_COPY_OBJECT_SIZE_IN_BYTES) {
        await s3.copyObject({
            Bucket: targetBucket,
            Key: targetKey,
            CopySource: copySource,
        });
        stopCopyTimer();
        return;
    }

    const sourceObject = await s3.getObject({
        Key: sourceKey,
        Bucket: sourceBucket,
    });

    const sourceObjectStream = sourceObject.Body?.transformToWebStream();
    if (sourceObjectStream === undefined) {
        return;
    }

    const upload = new Upload({
        client: s3,
        partSize: PART_SIZE,
        params: {
            Bucket: targetBucket,
            Key: targetKey,
            Body: sourceObjectStream,
        },
    });

    upload.on("httpUploadProgress", logUploadProgress);
    await upload.done();

    stopCopyTimer();
};

export type { CopyObjectOptions };
export { copyObject };
