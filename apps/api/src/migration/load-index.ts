import { parseArgs } from "node:util";
import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { loadImport } from "./load-import";

const main = async () => {
    const { values } = parseArgs({
        options: {
            input: { type: "string" },
            "skip-preflight": { type: "boolean" },
        },
    });

    if (values.input == null) {
        throw new Error("Provide --input prepared-data-directory.");
    }

    const result = await loadImport({
        client: new PocketBaseClient(loadPocketBaseConfig()),
        directory: values.input,
        onProgress: (progress) => {
            process.stderr.write(
                JSON.stringify({
                    at: new Date().toISOString(),
                    event: "import.progress",
                    ...progress,
                }) + "\n"
            );
        },
        skipPreflight: values["skip-preflight"],
    });

    process.stdout.write(JSON.stringify(result, null, 4) + "\n");
};

main().catch((error: unknown) => {
    process.stderr.write(
        (error instanceof Error ? error.message : "Import failed.") + "\n"
    );
    process.exitCode = 1;
});
