import { program } from "commander";
import type { DeleteMergedRemoteDbsOptions } from "./delete-merged-remote-dbs";
import { deleteMergedRemoteDbs } from "./delete-merged-remote-dbs";

program.option("--dry", "Runs without actually performing the delete", false);

program.option(
    "--skip-confirmation",
    "Skips the confirmation prompt before deleting",
    false
);

program.parse();
const { skipConfirmation, dry } = program.opts<DeleteMergedRemoteDbsOptions>();

const main = async () => {
    await deleteMergedRemoteDbs({ skipConfirmation, dry });
};

main();
