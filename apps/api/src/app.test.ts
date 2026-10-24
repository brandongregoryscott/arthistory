import type { Registry } from "@prometheus-io/client";
import type { Request, Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";
import posthog from "posthog-js";

let server: Server | undefined;
let origin: string;
let metricsServer: Server | undefined;
let metricsOrigin: string;
let registry: Registry;
const respond =
    (route: string) => async (_request: Request, response: Response) =>
        response.json({ route });

before(async () => {
    mock.method(posthog, "init", () => posthog);
    const { ArtistsController } =
        await import("./controllers/artists-controller.js");
    const { MetaController } = await import("./controllers/meta-controller.js");
    // Stub dependencies before Express captures the controllers, then exercise
    // the actual HTTP router without contacting Spotify or opening SQLite.
    mock.method(MetaController, "latest", respond("latest"));
    mock.method(ArtistsController, "requestArtist", respond("requestArtist"));
    mock.method(
        ArtistsController,
        "searchArtistsByName",
        respond("searchArtistsByName")
    );
    mock.method(
        ArtistsController,
        "getArtistSnapshots",
        respond("getArtistSnapshots")
    );
    mock.method(ArtistsController, "listArtists", respond("listArtists"));
    mock.method(
        ArtistsController,
        "listArtistSnapshots",
        respond("listArtistSnapshots")
    );
    const { app, metrics } = await import("./app.js");
    ({ registry } = metrics);
    app.set("trust proxy", false);
    const activeServer = app.listen(0, "127.0.0.1");
    server = activeServer;
    await new Promise<void>((resolve) =>
        activeServer.once("listening", resolve)
    );
    origin = `http://127.0.0.1:${(activeServer.address() as AddressInfo).port}`;
    const activeMetricsServer = metrics.app.listen(0, "127.0.0.1");
    metricsServer = activeMetricsServer;
    await new Promise<void>((resolve) =>
        activeMetricsServer.once("listening", resolve)
    );
    metricsOrigin = `http://127.0.0.1:${(activeMetricsServer.address() as AddressInfo).port}`;
});

after(async () => {
    mock.restoreAll();
    for (const activeServer of [server, metricsServer]) {
        if (activeServer == null) {
            continue;
        }
        await new Promise<void>((resolve, reject) =>
            activeServer.close((error) =>
                error != null ? reject(error) : resolve()
            )
        );
    }
});

beforeEach(() => registry.resetMetrics());

test("health returns the shared contract", async () => {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
});

test("unversioned routes reach their existing controllers", async () => {
    const routes = [
        ["GET", "/meta/latest", "latest"],
        ["GET", "/artists/search?name=test", "searchArtistsByName"],
        ["GET", "/artists/test/snapshots", "getArtistSnapshots"],
        ["GET", "/artists?ids=test", "listArtists"],
        ["GET", "/artists/snapshots?ids=test", "listArtistSnapshots"],
        ["POST", "/artists/test/request", "requestArtist"],
    ] as const;
    for (const [method, path, handler] of routes) {
        const response = await fetch(`${origin}${path}`, { method });
        assert.equal(response.status, 200, `${method} ${path}`);
        assert.deepEqual(await response.json(), { route: handler });
    }
});

test("removed health and versioned routes return 404", async () => {
    for (const path of ["/healthcheck", "/v1/meta/latest", "/v1/artists"]) {
        assert.equal((await fetch(`${origin}${path}`)).status, 404);
    }
});

test("private listener exports runtime metrics while public /metrics stays unavailable", async () => {
    const publicResponse = await fetch(`${origin}/metrics`);
    const privateResponse = await fetch(`${metricsOrigin}/metrics`);
    const text = await privateResponse.text();

    assert.equal(publicResponse.status, 404);
    assert.equal(privateResponse.status, 200);
    assert.ok(text.includes("process_resident_memory_bytes"));
    assert.ok(text.includes('route="__unmatched__",status_code="404"'));
});

test("records the real controller route template without artist IDs or query strings", async () => {
    const response = await fetch(
        `${origin}/artists/private-artist/snapshots?token=private-query`
    );
    const text = await registry.metrics();

    assert.equal(response.status, 200);
    assert.ok(
        text.includes('route="/artists/:id/snapshots",status_code="200"')
    );
    assert.ok(!text.includes("private-artist"));
    assert.ok(!text.includes("private-query"));
});
