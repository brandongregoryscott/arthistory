import { program } from "commander";
import type { DeleteLocalDbsOptions } from "./delete-local-dbs";
import { deleteLocalDbs } from "./delete-local-dbs";

program.option("--dry", "Runs without actually performing the delete", false);

program.option(
    "--skip-confirmation",
    "Skips the confirmation prompt before deleting",
    false
);

program.parse();
const { dry, skipConfirmation } = program.opts<DeleteLocalDbsOptions>();

const main = async () => {
    await deleteLocalDbs({ dry, skipConfirmation });
    process.exit(0);
};

main();
