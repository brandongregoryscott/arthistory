import { parseArgs } from "node:util";
import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { loadImport } from "./load-import";

const main = async () => {
    const { values } = parseArgs({
        options: {
            checkpoint: { type: "string" },
            input: { type: "string" },
            "resume-after": { type: "string" },
            "skip-preflight": { type: "boolean" },
        },
    });

    if (values.input == null) {
        throw new Error("Provide --input prepared-data-directory.");
    }
    const resume = values["resume-after"];
    if (resume != null && !/^\d+$/.test(resume)) {
        throw new Error(
            "Provide --resume-after with a confirmed processed record count."
        );
    }

    const result = await loadImport({
        checkpointPath: values.checkpoint,
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
        resumeAfter: resume == null ? undefined : Number(resume),
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
