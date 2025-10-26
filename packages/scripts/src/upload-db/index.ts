import { program } from "commander";
import { BUCKET_NAME } from "../constants/storage";
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
    BUCKET_NAME
);

program.parse();
const { filename, bucket } = program.opts<Options>();

const main = async () => {
    await uploadDb({ filename, bucket });
};

main();
