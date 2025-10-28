import { program, Option } from "commander";
import { BucketName } from "../constants/storage";
import type { ListObjectsOptions } from "../utils/storage-utils";
import { listObjects } from "./list-objects";

program.option("--prefix <prefix>", "Object prefix to filter results by");

program.addOption(
    new Option("--bucket <bucket>", "Name of the bucket to list objects from")
        .choices(Object.values(BucketName))
        .default(BucketName.Snapshots)
);

program.parse();
const { bucket, prefix } = program.opts<ListObjectsOptions>();

const main = async () => {
    await listObjects({ bucket, prefix });
};

main();
