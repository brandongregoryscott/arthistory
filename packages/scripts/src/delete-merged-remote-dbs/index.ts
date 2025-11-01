import { program } from "commander";
import type { DeleteMergedRemoteDbsOptions } from "./delete-merged-remote-dbs";
import { deleteMergedRemoteDbs } from "./delete-merged-remote-dbs";

program.option(
    "--skip-confirmation",
    "Skips the confirmation prompt before deleting",
    false
);

program.parse();
const { skipConfirmation } = program.opts<DeleteMergedRemoteDbsOptions>();

const main = async () => {
    await deleteMergedRemoteDbs({ skipConfirmation });
};

main();
