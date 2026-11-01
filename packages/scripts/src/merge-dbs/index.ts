import { program } from "commander";
import type { MergeDbsOptions } from "./merge-dbs";
import { withWorkerLock } from "../utils/worker-lock";
import { mergeDbs } from "./merge-dbs";

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
    const ran = await withWorkerLock(async () => {
        await mergeDbs({ skipCheckpointAsBase, skipIndexes });
    });
    if (!ran) {
        throw new Error("Another sync or merge is running");
    }
};

main().catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
});
