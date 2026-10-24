import type { ErrorRequestHandler, Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
    createLogger,
    logRequestError,
    logStreamOpen,
    requestLogging,
} from "./logging";

type RecordData = Record<string, unknown>;

const servers: Server[] = [];

const capture = (level = "info") => {
    const lines: string[] = [];
    const log = createLogger(
        "test-api",
        {
            write: (line) => {
                lines.push(line);
            },
        },
        { APP_ENV: "test", APP_VERSION: "abc123", LOG_LEVEL: level }
    );
    return {
        lines,
        log,
        records: (): RecordData[] =>
            lines.map((line) => JSON.parse(line) as RecordData),
    };
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

describe("standard API logging", () => {
    it("correlates JSON logs with server-generated IDs and safe route templates", async () => {
        const output = capture();
        const app = express();
        app.use(requestLogging(output.log));
        app.get("/items/:id", (_request, response) => {
            output.log.info(
                { event: "operation.started" },
                "operation started"
            );
            response.json({ ok: true });
        });
        const origin = await serve(app);

        const first = await fetch(
            `${origin}/items/private-id?token=private-query`,
            {
                headers: {
                    Authorization: "Bearer private-auth",
                    Cookie: "session=private-cookie",
                    "X-Request-Id": "forged-id",
                },
            }
        );
        await first.text();
        const second = await fetch(`${origin}/items/another-private-id`);
        await second.text();
        const records = output.records();
        const completed = records.filter(
            (record) => record.event === "request.completed"
        );
        const nested = records.find(
            (record) => record.event === "operation.started"
        );

        expect(completed).toHaveLength(2);
        expect(first.headers.get("x-request-id") ?? "").toMatch(
            /^[a-f0-9-]{36}$/
        );
        expect(completed[0]?.requestId).toBe(first.headers.get("x-request-id"));
        expect(nested?.requestId).toBe(first.headers.get("x-request-id"));
        expect(first.headers.get("x-request-id")).not.toBe(
            second.headers.get("x-request-id")
        );
        expect(completed[0]?.route).toBe("/items/:id");
        expect(completed[0]?.service).toBe("test-api");
        expect(completed[0]?.environment).toBe("test");
        expect(completed[0]?.version).toBe("abc123");
        expect(completed[0]?.statusCode).toBe(200);
        expect(completed[0]?.level).toBe("info");
        expect(completed[0]?.durationMs).toBeTypeOf("number");
        for (const value of [
            "private-id",
            "another-private-id",
            "private-query",
            "private-auth",
            "private-cookie",
            "forged-id",
        ]) {
            expect(output.lines.join(""), value).not.toContain(value);
        }
    });

    it("logs rejected parsing before route matching with a request ID", async () => {
        const output = capture();
        const app = express();
        app.use(requestLogging(output.log));
        app.use(express.json());
        const reject: ErrorRequestHandler = (
            _error,
            _request,
            response,
            _next
        ) => {
            response.status(400).end();
        };
        app.use(reject);
        const origin = await serve(app);

        const response = await fetch(
            origin + "/private-path?secret=private-query",
            {
                body: '{"password":"private-body"',
                headers: { "Content-Type": "application/json" },
                method: "POST",
            }
        );
        await response.text();
        const records = output.records();

        expect(response.status).toBe(400);
        expect(records).toHaveLength(1);
        expect(records[0]?.level).toBe("warn");
        expect(records[0]?.route).toBe("__unmatched__");
        expect(records[0]?.requestId).toBe(
            response.headers.get("x-request-id")
        );
        expect(output.lines.join("")).not.toContain("private-");
    });

    it("captures safe error source frames without exception payloads or messages", async () => {
        const output = capture();
        const app = express();
        const cause = Object.assign(
            new Error("private-message\n    at private-injected-frame"),
            {
                cause: new Error("private-cause"),
                code: "ECONNREFUSED",
                password: "private-password",
                response: { token: "private-token" },
                status: 503,
            }
        );
        app.use(requestLogging(output.log));
        app.get("/fail/:id", () => {
            throw cause;
        });
        const fail: ErrorRequestHandler = (
            error,
            _request,
            response,
            _next
        ) => {
            logRequestError(response, error);
            response.status(503).end();
        };
        app.use(fail);
        const origin = await serve(app);

        const response = await fetch(origin + "/fail/private-id");
        await response.text();
        const records = output.records();
        const failure = records.find(
            (record) => record.event === "request.failed"
        );
        const completed = records.find(
            (record) => record.event === "request.completed"
        );

        expect(response.status).toBe(503);
        expect(failure).toBeDefined();
        expect(Object.keys(failure?.err as object).sort()).toEqual([
            "cause",
            "code",
            "stack",
            "status",
            "type",
        ]);
        expect((failure?.err as RecordData).code).toBe("ECONNREFUSED");
        expect(String((failure?.err as RecordData).stack)).toMatch(
            /logging\.test/
        );
        expect(failure?.requestId).toBe(response.headers.get("x-request-id"));
        expect(completed?.level).toBe("error");
        expect(output.lines.join("")).not.toContain("private-");
    });

    it("keeps healthy probes quiet while reporting unhealthy readiness", async () => {
        const output = capture();
        const app = express();
        app.use(requestLogging(output.log));
        app.get("/health", (_request, response) => {
            response.json({ ok: true });
        });
        app.get("/ready", (_request, response) => {
            response.status(503).end();
        });
        const origin = await serve(app);

        await fetch(origin + "/health").then((response) => response.text());
        await fetch(origin + "/ready").then((response) => response.text());
        const records = output.records();

        expect(records).toHaveLength(1);
        expect(records[0]?.route).toBe("/ready");
        expect(records[0]?.statusCode).toBe(503);
        expect(records[0]?.level).toBe("error");
    });

    it("emits one stream open/error/close lifecycle instead of request completion", async () => {
        const output = capture();
        const app = express();
        app.use(requestLogging(output.log));
        app.get("/events/:id", (_request, response) => {
            response.set("Content-Type", "text/event-stream");
            logStreamOpen(response);
            logStreamOpen(response);
            response.write("data: ready\n\n");
            response.emit("error", new Error("private-stream-error"));
            response.end();
        });
        const origin = await serve(app);

        const response = await fetch(origin + "/events/private-id");
        await response.text();
        const records = output.records();

        expect(records.map((record) => record.event)).toEqual([
            "stream.opened",
            "stream.error",
            "stream.closed",
        ]);
        expect(
            records.every(
                (record) =>
                    record.requestId === response.headers.get("x-request-id")
            )
        ).toBe(true);
        expect(records[0]?.durationMs).toBeTypeOf("number");
        expect(records[2]?.connectionDurationMs).toBeTypeOf("number");
        expect(records[2]?.durationMs).toBeUndefined();
        expect(records[2]?.route).toBe("/events/:id");
        expect(output.lines.join("")).not.toContain("private-");
    });

    it("redacts credential fields and never serializes request/response objects", () => {
        const output = capture();

        output.log.error(
            {
                body: { password: "private-body" },
                err: new Error("private-error"),
                headers: { cookie: "private-cookie" },
                nested: { token: "private-nested" },
                password: "private-password",
                req: { url: "/private-url" },
                response: { token: "private-response" },
                token: "private-token",
            },
            "operation failed"
        );
        const text = output.lines.join("");

        expect(output.records()).toHaveLength(1);
        expect(text).not.toContain("private-");
    });
});
