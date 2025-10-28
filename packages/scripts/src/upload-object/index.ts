import { program, Option } from "commander";
import { BucketName } from "../constants/storage";
import type { UploadObjectOptions } from "./upload-object";
import { uploadObject } from "./upload-object";

program.requiredOption("--filename <filename>", "Name of the file to upload");

program.addOption(
    new Option("--bucket <bucket>", "Name of the bucket to upload to")
        .choices(Object.values(BucketName))
        .default(BucketName.Snapshots)
);

program.parse();
const { filename, bucket } = program.opts<UploadObjectOptions>();

const main = async () => {
    await uploadObject({ filename, bucket });
};

main();
