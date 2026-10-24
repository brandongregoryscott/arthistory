import type { Registry } from "@prometheus-io/client";
import type { Request, Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import posthog from "posthog-js";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

let server: Server | undefined;
let origin: string;
let metricsServer: Server | undefined;
let metricsOrigin: string;
let registry: Registry;
const respond =
    (route: string) => async (_request: Request, response: Response) =>
        response.json({ route });

beforeAll(async () => {
    vi.spyOn(posthog, "init").mockImplementation(() => posthog);
    const { ArtistsController } =
        await import("./controllers/artists-controller.js");
    const { MetaController } = await import("./controllers/meta-controller.js");
    // Stub dependencies before Express captures the controllers, then exercise
    // the actual HTTP router without contacting Spotify or opening SQLite.
    vi.spyOn(MetaController, "latest").mockImplementation(respond("latest"));
    vi.spyOn(ArtistsController, "requestArtist").mockImplementation(
        respond("requestArtist")
    );
    vi.spyOn(ArtistsController, "searchArtistsByName").mockImplementation(
        respond("searchArtistsByName")
    );
    vi.spyOn(ArtistsController, "getArtistSnapshots").mockImplementation(
        respond("getArtistSnapshots")
    );
    vi.spyOn(ArtistsController, "listArtists").mockImplementation(
        respond("listArtists")
    );
    vi.spyOn(ArtistsController, "listArtistSnapshots").mockImplementation(
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

afterAll(async () => {
    vi.restoreAllMocks();
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
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
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
        expect(response.status, `${method} ${path}`).toBe(200);
        expect(await response.json()).toEqual({ route: handler });
    }
});

test("removed health and versioned routes return 404", async () => {
    for (const path of ["/healthcheck", "/v1/meta/latest", "/v1/artists"]) {
        expect((await fetch(`${origin}${path}`)).status).toBe(404);
    }
});

test("private listener exports runtime metrics while public /metrics stays unavailable", async () => {
    const publicResponse = await fetch(`${origin}/metrics`);
    const privateResponse = await fetch(`${metricsOrigin}/metrics`);
    const text = await privateResponse.text();

    expect(publicResponse.status).toBe(404);
    expect(privateResponse.status).toBe(200);
    expect(text).toContain("process_resident_memory_bytes");
    expect(text).toContain('route="__unmatched__",status_code="404"');
});

test("records the real controller route template without artist IDs or query strings", async () => {
    const response = await fetch(
        `${origin}/artists/private-artist/snapshots?token=private-query`
    );
    const text = await registry.metrics();

    expect(response.status).toBe(200);
    expect(text).toContain('route="/artists/:id/snapshots",status_code="200"');
    expect(text).not.toContain("private-artist");
    expect(text).not.toContain("private-query");
});
