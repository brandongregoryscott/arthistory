import { parseArgs } from "node:util";
import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { loadImport } from "./load-import";

const main = async () => {
    const { values } = parseArgs({ options: { input: { type: "string" } } });

    if (values.input == null) {
        throw new Error("Provide --input prepared-data-directory.");
    }

    const result = await loadImport({
        client: new PocketBaseClient(loadPocketBaseConfig()),
        directory: values.input,
    });

    process.stdout.write(JSON.stringify(result, null, 4) + "\n");
};

main().catch((error: unknown) => {
    process.stderr.write(
        (error instanceof Error ? error.message : "Import failed.") + "\n"
    );
    process.exitCode = 1;
});
