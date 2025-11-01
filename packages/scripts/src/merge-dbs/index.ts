import { program } from "commander";
import "./merge-dbs";
import { mergeDbs, type MergeDbsOptions } from "./merge-dbs";

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

program.parse();
const { skipCheckpointAsBase, skipIndexes } = program.opts<MergeDbsOptions>();

const main = async () => {
    await mergeDbs({ skipCheckpointAsBase, skipIndexes });
};

main();
