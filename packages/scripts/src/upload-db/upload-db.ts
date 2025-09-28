import { program } from "commander";
import { existsSync } from "node:fs";
import { s3 } from "../utils/storage-utils";
import { createReadStream } from "node:fs";
import { Upload } from "@aws-sdk/lib-storage";
import { BUCKET_NAME } from "../constants/storage";

interface Options {
    filename: string;
    bucket: string;
}

program.requiredOption(
    "--filename <filename>",
    "Name of the database to upload"
);

program.requiredOption(
    "--bucket <bucket>",
    "Name of the bucket to upload to",
    BUCKET_NAME
);

program.parse();
const { filename, bucket } = program.opts<Options>();

/**
 * Upload parts 50 MB at a time to reduce API usage
 */
const PART_SIZE = 50 * Math.pow(1024, 2);

const main = async () => {
    if (!existsSync(filename)) {
        console.error(`File '${filename}' not found.`);
        process.exit(1);
    }

    console.log(`Starting upload for ${filename}...`);
    const label = `Uploaded '${filename}'`;
    console.time(label);
    const readStream = createReadStream(filename);

    // This is a hack, but the Upload utility class from `@aws-sdk/lib-storage` is currently bugged
    // and does not respect the `partSize` that is passed in. The internal logic will take the MIN_PART_SIZE
    // even if you pass in a value larger than it, because it does some check based on the total byte count / MAX_PARTS:
    // https://github.com/aws/aws-sdk-js-v3/blob/ad1514df905b7b661f7f81050f5f2102d31e5cfa/lib/lib-storage/src/Upload.ts#L96
    // For example, if `totalBytes` is 7019552768, roughly ~6.5 GB, it will result in `Math.max(Upload.MIN_PART_SIZE = 5 * 1024 * 1024 = 5 MB, 7019552768 / 10000 = 701955.2768 = 0.66 MB)`
    /* @ts-ignore */
    Upload.MIN_PART_SIZE = PART_SIZE;
    const upload = new Upload({
        client: s3,
        params: {
            Bucket: bucket,
            Key: filename,
            Body: readStream,
        },
    });

    upload.on("httpUploadProgress", (progress) => {
        const loaded = progress.loaded ?? 1;
        const total = progress.total ?? 1;

        const percentage = ((loaded / total) * 100).toFixed(2);
        console.log(
            `Part ${progress.part} - ${bytesToMb(loaded)} / ${bytesToMb(total)} - ${percentage}% complete`
        );
    });

    await upload.done();
    console.timeEnd(label);
};

const bytesToMb = (bytes: number): string =>
    `${(bytes / 1024 / 1024).toFixed(2)} MB`;

main();
