import type { ErrorRequestHandler, Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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

        assert.equal(completed.length, 2);
        assert.match(
            first.headers.get("x-request-id") ?? "",
            /^[a-f0-9-]{36}$/
        );
        assert.equal(
            completed[0]?.requestId,
            first.headers.get("x-request-id")
        );
        assert.equal(nested?.requestId, first.headers.get("x-request-id"));
        assert.notEqual(
            first.headers.get("x-request-id"),
            second.headers.get("x-request-id")
        );
        assert.equal(completed[0]?.route, "/items/:id");
        assert.equal(completed[0]?.service, "test-api");
        assert.equal(completed[0]?.environment, "test");
        assert.equal(completed[0]?.version, "abc123");
        assert.equal(completed[0]?.statusCode, 200);
        assert.equal(completed[0]?.level, "info");
        assert.equal(typeof completed[0]?.durationMs, "number");
        for (const value of [
            "private-id",
            "another-private-id",
            "private-query",
            "private-auth",
            "private-cookie",
            "forged-id",
        ]) {
            assert.ok(!output.lines.join("").includes(value), value);
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

        assert.equal(response.status, 400);
        assert.equal(records.length, 1);
        assert.equal(records[0]?.level, "warn");
        assert.equal(records[0]?.route, "__unmatched__");
        assert.equal(
            records[0]?.requestId,
            response.headers.get("x-request-id")
        );
        assert.ok(!output.lines.join("").includes("private-"));
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

        assert.equal(response.status, 503);
        assert.ok(failure != null);
        assert.deepEqual(Object.keys(failure.err as object).sort(), [
            "cause",
            "code",
            "stack",
            "status",
            "type",
        ]);
        assert.equal((failure.err as RecordData).code, "ECONNREFUSED");
        assert.match(
            String((failure.err as RecordData).stack),
            /logging\.test/
        );
        assert.equal(failure.requestId, response.headers.get("x-request-id"));
        assert.equal(completed?.level, "error");
        assert.ok(!output.lines.join("").includes("private-"));
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

        assert.equal(records.length, 1);
        assert.equal(records[0]?.route, "/ready");
        assert.equal(records[0]?.statusCode, 503);
        assert.equal(records[0]?.level, "error");
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

        assert.deepEqual(
            records.map((record) => record.event),
            ["stream.opened", "stream.error", "stream.closed"]
        );
        assert.ok(
            records.every(
                (record) =>
                    record.requestId === response.headers.get("x-request-id")
            )
        );
        assert.equal(typeof records[0]?.durationMs, "number");
        assert.equal(typeof records[2]?.connectionDurationMs, "number");
        assert.equal(records[2]?.durationMs, undefined);
        assert.equal(records[2]?.route, "/events/:id");
        assert.ok(!output.lines.join("").includes("private-"));
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

        assert.equal(output.records().length, 1);
        assert.ok(!text.includes("private-"));
    });
});
