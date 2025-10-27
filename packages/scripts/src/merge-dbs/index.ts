import { program } from "commander";
import "./merge-dbs";
import { mergeDbs, type MergeDbsOptions } from "./merge-dbs";
import { MERGED_DB_NAME } from "../constants/storage";

program.option(
    "--skip-checkpoint-as-base",
    "Skip using the largest partial database as the base to merge onto",
    false
);
program.option(
    "--skip-indexes",
    "Skip creating indexes after merging partial databases",
    false
);
program.option(
    "--use-range-filename",
    `Set the name of the merged file to the start and end timestamps instead of '${MERGED_DB_NAME}'`,
    false
);

program.parse();
const { skipCheckpointAsBase, skipIndexes, useRangeFilename } =
    program.opts<MergeDbsOptions>();

const main = async () => {
    await mergeDbs({ skipCheckpointAsBase, skipIndexes, useRangeFilename });
};

main();
