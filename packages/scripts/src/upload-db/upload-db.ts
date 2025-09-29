import { program } from "commander";
import { existsSync } from "node:fs";
import { logUploadProgress, s3 } from "../utils/storage-utils";
import { createReadStream } from "node:fs";
import { Upload } from "@aws-sdk/lib-storage";
import { BUCKET_NAME } from "../constants/storage";
import { bytesToMb } from "../utils/fs-utils";

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

main();
