import { program } from "commander";
import { SNAPSHOT_DB_BUCKET_NAME } from "../constants/storage";
import { uploadDb } from "./upload-db";

interface Options {
    bucket: string;
    filename: string;
}

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
const { filename, bucket } = program.opts<Options>();

const main = async () => {
    await uploadDb({ filename, bucket });
};

main();
