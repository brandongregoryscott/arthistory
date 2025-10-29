import { program, Option } from "commander";
import { BucketName } from "../constants";
import type { CopyObjectOptions } from "./copy-object";
import { copyObject } from "./copy-object";

program.requiredOption(
    "--source-key <key>",
    "Name of the source object to copy"
);

program.addOption(
    new Option(
        "--source-bucket <bucket>",
        "Name of the bucket the source object is in"
    )
        .choices(Object.values(BucketName))
        .default(BucketName.Snapshots)
        .makeOptionMandatory(true)
);

program.option("--target-key <key>", "Name of the target object");

program.addOption(
    new Option(
        "--target-bucket <bucket>",
        "Name of the bucket to copy the object to"
    )
        .choices(Object.values(BucketName))
        .default(BucketName.Snapshots)
        .makeOptionMandatory(true)
);

program.parse();

const options = program.opts<CopyObjectOptions>();
const { sourceBucket, sourceKey, targetBucket } = options;

const main = async () => {
    await copyObject({
        sourceBucket,
        sourceKey,
        targetBucket,
        targetKey: options.targetKey ?? sourceKey,
    });
};

main();
