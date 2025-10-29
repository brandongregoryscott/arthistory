import { program, Option } from "commander";
import { BucketName } from "../constants/storage";
import type { DownloadObjectOptions } from "../utils/storage-utils";
import { downloadObject } from "./download-object";

program.addOption(
    new Option(
        "--bucket <bucket>",
        "Name of the bucket to download the object from"
    )
        .choices(Object.values(BucketName))
        .default(BucketName.Snapshots)
);

program.requiredOption("--key <key>", "Key of the object to download");

program.parse();
const { bucket, key } = program.opts<DownloadObjectOptions>();

const main = async () => {
    await downloadObject({ bucket, key });
};

main();
