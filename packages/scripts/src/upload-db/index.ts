import { program } from "commander";
import { BucketName } from "../constants/storage";
import type { UploadDbOptions } from "./upload-db";
import { uploadDb } from "./upload-db";

program.requiredOption(
    "--filename <filename>",
    "Name of the database to upload"
);

program.requiredOption(
    "--bucket <bucket>",
    "Name of the bucket to upload to",
    BucketName.Snapshots
);

program.parse();
const { filename, bucket } = program.opts<UploadDbOptions>();

const main = async () => {
    await uploadDb({ filename, bucket });
};

main();
