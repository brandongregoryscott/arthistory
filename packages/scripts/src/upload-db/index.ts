import { program } from "commander";
import { SNAPSHOT_DB_BUCKET_NAME } from "../constants/storage";
import type { UploadDbOptions } from "./upload-db";
import { uploadDb } from "./upload-db";

program.requiredOption(
    "--filename <filename>",
    "Name of the database to upload"
);

program.requiredOption(
    "--bucket <bucket>",
    "Name of the bucket to upload to",
    SNAPSHOT_DB_BUCKET_NAME
);

program.parse();
const { filename, bucket } = program.opts<UploadDbOptions>();

const main = async () => {
    await uploadDb({ filename, bucket });
};

main();
