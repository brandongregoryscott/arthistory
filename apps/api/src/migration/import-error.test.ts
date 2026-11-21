import { ClientResponseError } from "pocketbase";
import { describe, expect, it } from "vitest";
import { importError } from "./import-error";

const context = {
    batch: 3,
    records: [{ collection: "snapshots", id: "111111111111111" }],
    stage: "Create PocketBase record batch",
};

describe("importError", () => {
    it("reports status, path, field errors and record context without credentials or request bodies", () => {
        const error = new ClientResponseError({
            originalError: new Error("secret-password"),
            response: {
                data: {
                    requests: [
                        {
                            response: {
                                data: {
                                    artist: {
                                        code: "validation_missing_rel_records",
                                        message: "Missing artist.",
                                    },
                                },
                                message: "Failed to create record.",
                                password: "secret-password",
                                token: "secret-token",
                            },
                        },
                    ],
                },
                message: "Something went wrong while processing your request.",
            },
            status: 400,
            url: "http://owner:secret-password@pocketbase:8090/api/batch?token=secret-token",
        });
        const result = importError(error, context, {
            created: 100,
            skipped: 5,
        });
        expect(JSON.parse(result.message)).toMatchObject({
            ...context,
            created: 100,
            pocketbase: {
                path: "/api/batch",
                status: 400,
                validation: expect.arrayContaining([
                    {
                        code: "validation_missing_rel_records",
                        message: "Missing artist.",
                        path: "data.requests[0].response.data.artist",
                    },
                ]),
            },
            skipped: 5,
        });
        expect(result.message).not.toContain("secret-password");
        expect(result.message).not.toContain("secret-token");
        expect(result.message).not.toContain("originalError");
    });

    it("handles transport errors with no URL and preserves local conflict errors", () => {
        const network = importError(
            new ClientResponseError({ isAbort: true, status: 0 }),
            context,
            { created: 0, skipped: 0 }
        );
        expect(JSON.parse(network.message).pocketbase).toMatchObject({
            aborted: true,
            status: 0,
        });
        expect(
            importError(new Error("Conflicting snapshots record"), context, {
                created: 0,
                skipped: 0,
            }).message
        ).toContain("Conflicting snapshots record");
    });
});
