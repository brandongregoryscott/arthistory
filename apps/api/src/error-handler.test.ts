import type { ApiError } from "@repo/common";
import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
    ErrorName,
    NotFoundError,
    UnhandledError,
    ValidationError,
} from "@repo/common";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaController } from "./controllers/meta-controller";
import { errorHandler } from "./error-handler";
import { createLogger, requestLogging } from "./logging";
import {
    badRequest,
    conflict,
    notFound,
    tooManyRequests,
} from "./utilities/responses";

vi.mock("./services/meta-service", () => ({
    MetaService: { latest: vi.fn(async () => undefined) },
}));

const servers: Server[] = [];
const privateValue = "private-provider-token";
const publicInternalError = {
    data: null,
    error: {
        message: "An unhandled error occurred.",
        name: ErrorName.ERROR_UNHANDLED,
    },
};

const createApp = () => {
    const lines: string[] = [];
    const logger = createLogger(
        "test-api",
        { write: (line) => lines.push(line) },
        { APP_ENV: "production", LOG_LEVEL: "info" }
    );
    const app = express();
    app.use(requestLogging(logger));
    return { app, lines };
};

const serve = async (app: Express) => {
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => {
                    server.close(() => resolve());
                    server.closeAllConnections();
                })
        )
    );
});

describe("HTTP error responses", () => {
    it("returns a public not-found error when latest metadata is missing", async () => {
        const { app } = createApp();
        app.get("/meta/latest", MetaController.latest);
        app.use(errorHandler);
        const origin = await serve(app);

        const response = await fetch(`${origin}/meta/latest`);
        const body: unknown = await response.json();

        expect(response.status).toBe(404);
        expect(body).toEqual({
            data: null,
            error: {
                message: "Latest data could not be found",
                name: ErrorName.ERROR_NOT_FOUND,
            },
        });
    });

    it("hides provider diagnostics while retaining correlated sanitized logs", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const { app, lines } = createApp();
        const error = Object.assign(new Error(privateValue), {
            cause: new Error("private-provider-cause"),
            code: "SQLITE_ERROR",
            providerContext: { token: privateValue },
            response: { headers: { authorization: privateValue } },
        });
        app.get("/provider", async () => {
            throw error;
        });
        app.use(errorHandler);
        const origin = await serve(app);

        const response = await fetch(`${origin}/provider`);
        const body: unknown = await response.json();
        const records = lines.map(
            (line) => JSON.parse(line) as Record<string, unknown>
        );
        const failed = records.filter(
            (record) => record.event === "request.failed"
        );

        expect(response.status).toBe(500);
        expect(body).toEqual(publicInternalError);
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({
            err: {
                cause: { type: "Error" },
                code: "SQLITE_ERROR",
                stack: expect.stringContaining(" at "),
                type: "Error",
            },
            requestId: response.headers.get("X-Request-Id"),
            route: "/provider",
        });
        expect(lines.join("")).not.toContain(privateValue);
        expect(lines.join("")).not.toContain("private-provider-cause");
    });

    it("masks unexpected thrown values and custom unhandled messages in every environment", async () => {
        const testCases = [
            {
                error: {
                    message: privateValue,
                    name: "ProviderError",
                    token: privateValue,
                },
                name: "plain object",
            },
            { error: privateValue, name: "string rejection" },
            {
                error: new UnhandledError(privateValue),
                name: "custom unhandled error",
            },
        ];
        const { app } = createApp();
        for (const [index, testCase] of testCases.entries()) {
            app.get(`/errors/${index}`, async () => {
                throw testCase.error;
            });
        }
        app.use(errorHandler);
        const origin = await serve(app);

        for (const environment of ["development", "production"]) {
            vi.stubEnv("NODE_ENV", environment);
            for (const [index, testCase] of testCases.entries()) {
                const response = await fetch(`${origin}/errors/${index}`);
                const body: unknown = await response.json();

                expect(response.status, testCase.name).toBe(500);
                expect(body, testCase.name).toEqual(publicInternalError);
            }
        }
    });

    it("preserves expected error statuses and messages without exposing attached details", async () => {
        const testCases = [
            {
                error: new ValidationError("Select a valid artist."),
                status: 400,
            },
            {
                error: new NotFoundError("The artist was not found."),
                status: 404,
            },
        ];
        const { app } = createApp();
        for (const [index, testCase] of testCases.entries()) {
            Object.assign(testCase.error, {
                cause: new Error(privateValue),
                token: privateValue,
            });
            app.get(`/expected/${index}`, async () => {
                throw testCase.error;
            });
        }
        app.use(errorHandler);
        const origin = await serve(app);

        for (const [index, testCase] of testCases.entries()) {
            const response = await fetch(`${origin}/expected/${index}`);
            const body: unknown = await response.json();

            expect(response.status).toBe(testCase.status);
            expect(body).toEqual({
                data: null,
                error: {
                    message: testCase.error.message,
                    name: testCase.error.name,
                },
            });
        }
    });

    it("allowlists public client errors without invoking custom serializers", async () => {
        const testCases = [
            { send: badRequest, status: 400 },
            { send: notFound, status: 404 },
            { send: conflict, status: 409 },
            { send: tooManyRequests, status: 429 },
        ];
        const toJSON = vi.fn(() => ({ token: privateValue }));
        const error = {
            cause: new Error(privateValue),
            message: "Public request message.",
            name: "PUBLIC_ERROR",
            stack: privateValue,
            toJSON,
            token: privateValue,
        } satisfies ApiError & Record<string, unknown>;
        const { app } = createApp();
        for (const testCase of testCases) {
            app.get(`/status/${testCase.status}`, (_request, response) => {
                testCase.send(response, error);
            });
        }
        const origin = await serve(app);

        for (const testCase of testCases) {
            const response = await fetch(`${origin}/status/${testCase.status}`);
            const body: unknown = await response.json();

            expect(response.status).toBe(testCase.status);
            expect(body).toEqual({
                data: null,
                error: { message: error.message, name: error.name },
            });
        }
        expect(toJSON).not.toHaveBeenCalled();
    });
});
