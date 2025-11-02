import { program } from "commander";
import { createSampleDb, type CreateSampleDbOptions } from "./create-sample-db";

program.requiredOption(
    "--input-filename <filename>",
    "Name of the source database to retrieve data from"
);

program.option(
    "--output-filename <filename>",
    "Name of the sample database to create"
);

program.option(
    "--id <ids...>",
    "Ids of the artists to retrieve from the input database"
);

program.option(
    "--skip-indexes",
    "Skip creating indexes for the sample database",
    false
);

program.parse();

const options = program.opts<CreateSampleDbOptions>();
const { ids, outputFilename, inputFilename, skipIndexes } = options;

const main = async () => {
    await createSampleDb({ inputFilename, outputFilename, ids, skipIndexes });
};

main();
