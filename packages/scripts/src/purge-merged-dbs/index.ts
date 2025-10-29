import { program } from "commander";
import type { PurgeMergedDbsOptions } from "./purge-merged-dbs";
import { purgeMergedDbs } from "./purge-merged-dbs";

program.option(
    "--skip-confirmation",
    "Skips the confirmation prompt before deleting",
    false
);

program.parse();
const { skipConfirmation } = program.opts<PurgeMergedDbsOptions>();

const main = async () => {
    await purgeMergedDbs({ skipConfirmation });
};

main();
