import { parseArgs } from "node:util";
import { openLegacySource, validateSource } from "./legacy-source";
import { prepareImport } from "./prepare-import";

const main = () => {
    const { values } = parseArgs({
        options: {
            cutoff: { default: "10000", type: "string" },
            inventory: { type: "boolean" },
            "keep-id": { multiple: true, type: "string" },
            output: { type: "string" },
            source: { type: "string" },
            "timestamp-unit": { type: "string" },
        },
    });

    const source = validateSource({
        filename: values.source,
        timestampUnit: values["timestamp-unit"],
    });

    if (values.inventory === true) {
        const opened = openLegacySource(source);

        try {
            process.stdout.write(
                JSON.stringify(opened.inventory, null, 4) + "\n"
            );
        } finally {
            opened.db.close();
        }

        return;
    }

    if (values.output == null) {
        throw new Error("Provide --output directory.");
    }

    if (!/^\d+$/.test(values.cutoff)) {
        throw new Error("Cutoff must be a nonnegative decimal integer.");
    }

    const report = prepareImport({
        cutoff: parseInt(values.cutoff, 10),
        keepIds: values["keep-id"],
        output: values.output,
        source,
    });
    process.stdout.write(JSON.stringify(report, null, 4) + "\n");
    if (report.counts.invalidRows > 0) {
        process.stderr.write(
            `Skipped ${report.counts.invalidRows} invalid rows; review ${values.output}/errors.jsonl before importing.\n`
        );
    }
};

main();
