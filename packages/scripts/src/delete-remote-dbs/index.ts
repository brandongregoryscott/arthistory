import { program } from "commander";
import type { DeleteRemoteDbsOptions } from "./delete-remote-dbs";
import { deleteRemoteDbs } from "./delete-remote-dbs";

program.option("--dry", "Runs without actually performing the delete", false);

program.option(
    "--skip-confirmation",
    "Skips the confirmation prompt before deleting",
    false
);

program.parse();
const { dry, skipConfirmation } = program.opts<DeleteRemoteDbsOptions>();

const main = async () => {
    await deleteRemoteDbs({ dry, skipConfirmation });
    process.exit(0);
};

main();
