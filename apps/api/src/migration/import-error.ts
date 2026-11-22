import { isError, isPlainObject } from "lodash";
import { ClientResponseError } from "pocketbase";

type ImportContext = {
    batch: number;
    records: { collection: string; id: string }[];
    resumed?: number;
    stage: string;
};

type ValidationDetail = { code?: string; message?: string; path: string };

// Keep field/batch validation errors, never SDK request headers, bodies, tokens,
// originalError, or the URL query string. This output is for the owner CLI only.
const validationDetails = (input: unknown) => {
    const details: ValidationDetail[] = [];
    const visit = (value: unknown, path: string, depth: number) => {
        if (depth > 10 || details.length >= 100 || value == null) {
            return;
        }
        if (Array.isArray(value)) {
            value.slice(0, 100).forEach((entry, index) => {
                visit(entry, `${path}[${index}]`, depth + 1);
            });
            return;
        }
        if (!isPlainObject(value)) {
            return;
        }
        const record = value as Record<string, unknown>;
        if (
            typeof record.code === "string" ||
            typeof record.message === "string"
        ) {
            details.push({
                ...(typeof record.code === "string"
                    ? { code: record.code.slice(0, 1000) }
                    : {}),
                ...(typeof record.message === "string"
                    ? { message: record.message.slice(0, 1000) }
                    : {}),
                path,
            });
        }
        for (const [key, entry] of Object.entries(record).slice(0, 100)) {
            visit(entry, `${path}.${key}`, depth + 1);
        }
    };
    visit(input, "data", 0);
    return details;
};

type ImportErrorCounts = { created: number; skipped: number };

const importError = (
    error: unknown,
    context: ImportContext,
    counts: ImportErrorCounts
) => {
    let pocketbase;
    if (error instanceof ClientResponseError) {
        let path: string | undefined;
        try {
            path = new URL(error.url).pathname;
        } catch {
            // Transport failures can have no URL.
        }
        pocketbase = {
            aborted: error.isAbort,
            ...(error.status >= 500
                ? {
                      hint: "Check PocketBase dashboard Logs at the failure time for the underlying server error.",
                  }
                : {}),
            path,
            status: error.status,
            validation: validationDetails(error.response.data),
        };
    }
    return new Error(
        JSON.stringify(
            {
                ...context,
                created: counts.created,
                failedAt: new Date().toISOString(),
                message: isError(error) ? error.message : "Import failed.",
                pocketbase,
                skipped: counts.skipped,
            },
            null,
            4
        )
    );
};

export { importError };
export type { ImportContext };
