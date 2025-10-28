import { program, Option } from "commander";
import { BucketName } from "../constants/storage";
import type { DownloadDbOptions } from "./download-db";
import { downloadDb } from "./download-db";

program.option("--prefix <prefix>", "Object prefix to filter dbs by");

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
const { bucket, key } = program.opts<DownloadDbOptions>();

const main = async () => {
    await downloadDb({ bucket, key });
};

main();
