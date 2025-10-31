import { program, Option } from "commander";
import { BucketName } from "../constants/storage";
import type { UploadObjectOptions } from "./upload-object";
import { uploadObject } from "./upload-object";

program.requiredOption("--filename <filename>", "Name of the file to upload");
program.option(
    "--key <key>",
    "Key of the object to be uploaded in the bucket, which can be different from the input filename"
);

program.addOption(
    new Option("--bucket <bucket>", "Name of the bucket to upload to")
        .choices(Object.values(BucketName))
        .default(BucketName.Snapshots)
);

program.parse();
const { filename, bucket, key } = program.opts<UploadObjectOptions>();

const main = async () => {
    await uploadObject({ filename, bucket, key });
};

main();
