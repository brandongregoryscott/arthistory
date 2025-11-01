import { program } from "commander";
import { createArtistSnapshotsIndexes, openDb } from "../utils/db-utils";

interface CreateIndexesOptions {
    filename: string;
}

program.requiredOption(
    "--filename <filename>",
    "Name of the database to create indexes for"
);

program.parse();
const { filename } = program.opts<CreateIndexesOptions>();

const main = async () => {
    const db = await openDb(filename);
    await createArtistSnapshotsIndexes(db);
    process.exit(0);
};

main();
