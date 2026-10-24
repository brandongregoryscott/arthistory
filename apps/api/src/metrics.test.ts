import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createMetrics } from "./metrics";

const servers: Server[] = [];

async function serve(app: Express) {
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve, reject) => {
                    if (!server.listening) {
                        resolve();
                        return;
                    }
                    server.close((error) =>
                        error == null ? resolve() : reject(error)
                    );
                    server.closeAllConnections();
                })
        )
    );
});

describe("createMetrics", () => {
    it("aggregates request latency by template and status without leaking identifiers or secrets", async () => {
        const metrics = createMetrics();
        const app = express();
        app.use(metrics.middleware);
        app.get("/artists/:id/snapshots", (_req, res) => res.status(503).end());
        const origin = await serve(app);
        const endpoint = await serve(metrics.app);

        await fetch(
            `${origin}/artists/private-artist/snapshots?query=private-query`,
            {
                headers: { Authorization: "Bearer private-token" },
            }
        );
        await fetch(`${origin}/artists/another-artist/snapshots`);
        const response = await fetch(`${endpoint}/metrics`);
        const text = await response.text();

        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
        assert.ok(
            text.includes(
                'http_request_duration_seconds_count{method="GET",route="/artists/:id/snapshots",status_code="503"} 2'
            )
        );
        assert.ok(
            text.includes('http_request_duration_seconds_bucket{le="0.005",')
        );
        assert.ok(text.includes("process_resident_memory_bytes"));
        assert.ok(text.includes("nodejs_eventloop_lag_p99_seconds"));
        for (const secret of [
            "private-artist",
            "another-artist",
            "private-query",
            "private-token",
        ]) {
            assert.ok(!text.includes(secret), secret);
        }
    });

    it("bounds labels for unmatched paths and unusual methods", async () => {
        const metrics = createMetrics();
        const app = express();
        app.use(metrics.middleware);
        const origin = await serve(app);

        await fetch(`${origin}/first-private-path`);
        await fetch(`${origin}/second-private-path`);
        await fetch(`${origin}/custom-private-path`, { method: "PROPFIND" });
        const text = await metrics.registry.metrics();

        assert.ok(
            text.includes(
                'http_request_duration_seconds_count{method="GET",route="__unmatched__",status_code="404"} 2'
            )
        );
        assert.ok(
            text.includes(
                'http_request_duration_seconds_count{method="OTHER",route="__unmatched__",status_code="404"} 1'
            )
        );
        assert.ok(!text.includes("private-path"));
        assert.ok(!text.includes("PROPFIND"));
    });

    it("excludes health probes and metrics scrapes", async () => {
        const metrics = createMetrics();
        const app = express();
        app.use(metrics.middleware);
        app.get("/health", (_req, res) => res.status(503).end());
        const origin = await serve(app);
        const endpoint = await serve(metrics.app);

        await fetch(`${origin}/health`);
        await fetch(`${endpoint}/metrics`);
        const text = await metrics.registry.metrics();

        assert.ok(!text.includes("http_request_duration_seconds_count{"));
        assert.ok(text.includes("process_resident_memory_bytes"));
    });

    it("isolates observations between registries", async () => {
        const first = createMetrics();
        const second = createMetrics();
        const app = express();
        app.use(first.middleware);
        const origin = await serve(app);

        await fetch(`${origin}/unknown`);
        const firstText = await first.registry.metrics();
        const secondText = await second.registry.metrics();

        assert.ok(firstText.includes('route="__unmatched__"'));
        assert.ok(!secondText.includes("http_request_duration_seconds_count{"));
    });
});
