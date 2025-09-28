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

const main = async () => {
    const copySource = `${sourceBucket}/${sourceFilename}`;
    const target = `${targetBucket}/${targetFilename}`;

    console.log(`Copying ${copySource} to ${target}...`);
    const label = `Copied ${copySource} to ${target}`;
    console.time(label);

    const sourceObject = await s3.getObject({
        Key: sourceFilename,
        Bucket: sourceBucket,
    });

    const sourceObjectStream = sourceObject.Body?.transformToWebStream();
    if (sourceObjectStream === undefined) {
        return;
    }

    /**
     * This is a hack, but the Upload utility class from `@aws-sdk/lib-storage` is currently bugged
     * and does not respect the `partSize` that is passed in. The internal logic will take the MIN_PART_SIZE
     *  even if you pass in a value larger than it, because it does some check based on the total byte count / MAX_PARTS:
     * https://github.com/aws/aws-sdk-js-v3/blob/ad1514df905b7b661f7f81050f5f2102d31e5cfa/lib/lib-storage/src/Upload.ts#L96
     * For example, if `totalBytes` is 7019552768, roughly ~6.5 GB, it will result in `Math.max(Upload.MIN_PART_SIZE = 5 * 1024 * 1024 = 5 MB, 7019552768 / 10000 = 701955.2768 = 0.66 MB)`
     * @see https://github.com/aws/aws-sdk-js-v3/issues/7379
     */
    /* @ts-ignore */
    Upload.MIN_PART_SIZE = PART_SIZE;
    const upload = new Upload({
        client: s3,
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
