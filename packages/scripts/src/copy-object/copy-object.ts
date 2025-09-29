import { program } from "commander";
import { logUploadProgress, s3 } from "../utils/storage-utils";
import { Upload } from "@aws-sdk/lib-storage";
import { bytesToMb } from "../utils/fs-utils";

interface Options {
    sourceFilename: string;
    sourceBucket: string;
    targetFilename: string;
    targetBucket: string;
}

program.requiredOption(
    "--source-filename <filename>",
    "Name of the source object to copy"
);

program.requiredOption(
    "--source-bucket <filename>",
    "Name of the bucket the source object is in"
);

program.option("--target-filename <filename>", "Name of the target object");

program.requiredOption(
    "--target-bucket <filename>",
    "Name of the bucket to copy the object to"
);

program.parse();

const options = program.opts<Options>();
const { sourceBucket, sourceFilename, targetBucket } = options;
const targetFilename = options.targetFilename ?? sourceFilename;

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

const main = async () => {
    const copySource = `${sourceBucket}/${sourceFilename}`;
    const target = `${targetBucket}/${targetFilename}`;

    console.log(`Copying ${copySource} to ${target}...`);
    const label = `Copied ${copySource} to ${target}`;
    console.time(label);

    const { ContentLength: size } = await s3.headObject({
        Key: sourceFilename,
        Bucket: sourceBucket,
    });

    if (size !== undefined && size < MAX_COPY_OBJECT_SIZE_IN_BYTES) {
        await s3.copyObject({
            Bucket: targetBucket,
            Key: targetFilename,
            CopySource: copySource,
        });
        console.timeEnd(label);
        return;
    }

    const sourceObject = await s3.getObject({
        Key: sourceFilename,
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
            Key: targetFilename,
            Body: sourceObjectStream,
        },
    });

    upload.on("httpUploadProgress", logUploadProgress);
    await upload.done();

    console.timeEnd(label);
};

main();
