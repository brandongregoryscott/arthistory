import { program, Option } from "commander";
import type { UploadObjectOptions } from "./upload-object";
import { BucketName } from "../constants/storage";
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
const { bucket, filename, key } = program.opts<UploadObjectOptions>();

const main = async () => {
    await uploadObject({ bucket, filename, key });
};

main();
