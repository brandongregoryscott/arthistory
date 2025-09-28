import { program } from "commander";
import { s3 } from "../utils/storage-utils";

interface Options {
    sourceFilename: string;
    sourceBucket: string;
    targetFilename: string;
    targetBucket: string;
}

program.requiredOption(
    "--source-filename <filename>",
    "Name of the source object to copy"
);

program.requiredOption(
    "--source-bucket <filename>",
    "Name of the bucket the source object is in"
);

program.option("--target-filename <filename>", "Name of the target object");

program.requiredOption(
    "--target-bucket <filename>",
    "Name of the bucket to copy the object to"
);

program.parse();

const options = program.opts<Options>();
const { sourceBucket, sourceFilename, targetBucket } = options;
const targetFilename = options.targetFilename ?? sourceFilename;

const main = async () => {
    const copySource = `${sourceBucket}/${sourceFilename}`;
    const target = `${targetBucket}/${targetFilename}`;

    console.log(`Copying ${copySource} to ${target}...`);
    const label = `Copied ${copySource} to ${target}`;
    console.time(label);

    const result = await s3.copyObject({
        Bucket: targetBucket,
        CopySource: copySource,
        Key: targetFilename,
    });

    console.timeEnd(label);
    console.log(result);
};

main();
