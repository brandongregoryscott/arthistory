import type { Registry } from "@prometheus-io/client";
import type { Express, Request, Response } from "express";
import type * as rateLimitModule from "express-rate-limit";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { request } from "node:http";
import { deflateSync, gzipSync } from "node:zlib";
import posthog from "posthog-js";
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
    vi,
} from "vitest";

// Keep the real limiter and store, lowering the quota only in rate-limit cases.
const generalQuota = vi.hoisted(() => ({ max: 1000 }));

vi.mock("express-rate-limit", async (importOriginal) => {
    const actual = await importOriginal<typeof rateLimitModule>();
    return {
        ...actual,
        default: (options: Parameters<typeof actual.default>[0]) =>
            actual.default({
                ...options,
                max:
                    options?.max === 1000
                        ? () => generalQuota.max
                        : options?.max,
            }),
    };
});

let app: Express;
let readRateLimiter: rateLimitModule.RateLimitRequestHandler;
let server: Server | undefined;
let origin: string;
let metricsServer: Server | undefined;
let metricsOrigin: string;
let registry: Registry;
const client = "198.51.100.10";
const otherClient = "198.51.100.11";
const headers = (ip = client, prefix = "203.0.113.1") => ({
    "X-Forwarded-For": `${prefix}, ${ip}`,
});

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
    const application = await import("./app.js");
    ({ app } = application);
    const { metrics } = application;
    ({ readRateLimiter } = await import("./utilities/rate-limiter.js"));
    ({ registry } = metrics);
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

beforeEach(() => {
    registry.resetMetrics();
    for (const ip of [client, otherClient, "127.0.0.1"]) {
        readRateLimiter.resetKey(ip);
    }
});

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

test("accepts compressed JSON without changing routing", async () => {
    const response = await fetch(`${origin}/__parser_probe__`, {
        body: new Uint8Array(gzipSync('{"name":"parser-probe"}')),
        headers: {
            "Content-Encoding": "gzip",
            "Content-Type": "application/json",
        },
        method: "POST",
    });

    expect(response.status).toBe(404);
});

test("finishes a compressed request before delayed trailing bytes without losing the listener", async () => {
    const first = Buffer.concat([
        new Uint8Array(deflateSync('{"name":"parser-probe"}')),
        new Uint8Array([0]),
    ]);
    const trailing = Buffer.alloc(1024);
    const status = await new Promise<number | undefined>((resolve, reject) => {
        const client = request(
            `${origin}/health`,
            {
                headers: {
                    "Content-Encoding": "deflate",
                    "Content-Length": first.length + trailing.length,
                    "Content-Type": "application/json",
                },
                method: "GET",
            },
            (response) => {
                // Send the remaining bytes only after the parser has handed off.
                client.end(trailing);
                response.resume();
                response.once("error", reject);
                response.once("end", () => resolve(response.statusCode));
            }
        );
        client.once("error", reject);
        client.setTimeout(2000, () =>
            client.destroy(new Error("Parser did not finish"))
        );
        client.write(first);
    });
    const next = await fetch(`${origin}/__parser_probe__`);

    expect(status).toBe(200);
    expect(next.status).toBe(404);
});

test("rejects malformed JSON before routing", async () => {
    const response = await fetch(`${origin}/__parser_probe__`, {
        body: "{",
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
        data: null,
        error: {
            message: "An unhandled error occurred.",
            name: "ERROR_UNHANDLED",
        },
    });
});

describe("rate limiting", () => {
    beforeEach(() => {
        generalQuota.max = 2;
        app.set("trust proxy", 1);
    });

    afterEach(() => {
        generalQuota.max = 1000;
        app.set("trust proxy", 0);
    });

    test("ignores forged forwarding headers when running without a proxy", async () => {
        app.set("trust proxy", 0);

        try {
            const first = await fetch(`${origin}/meta/latest`, {
                headers: headers(client),
            });
            const second = await fetch(`${origin}/meta/latest`, {
                headers: headers(otherClient),
            });
            const blocked = await fetch(`${origin}/meta/latest`, {
                headers: headers("198.51.100.12"),
            });

            expect(first.status).toBe(200);
            expect(second.status).toBe(200);
            expect(blocked.status).toBe(429);
        } finally {
            app.set("trust proxy", 1);
        }
    });

    test("limits successful reads and preserves the 429 response contract", async () => {
        const first = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });
        const second = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });
        const blocked = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });
        const payload = await blocked.json();

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(blocked.status).toBe(429);
        expect(blocked.headers.get("Retry-After")).not.toBeNull();
        expect(blocked.headers.get("RateLimit-Remaining")).toBe("0");
        expect(payload).toMatchObject({
            data: null,
            error: { name: "ERROR_RATE_LIMIT" },
        });
    });

    test("uses only the nearest forwarded client and keeps clients independent", async () => {
        const first = await fetch(`${origin}/meta/latest`, {
            headers: headers(client, "203.0.113.1"),
        });
        const second = await fetch(`${origin}/meta/latest`, {
            headers: headers(client, "203.0.113.2"),
        });
        const blocked = await fetch(`${origin}/meta/latest`, {
            headers: headers(client, "203.0.113.3"),
        });
        const independent = await fetch(`${origin}/meta/latest`, {
            headers: headers(otherClient),
        });

        expect(app.get("trust proxy")).toBe(1);
        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(blocked.status).toBe(429);
        expect(independent.status).toBe(200);
    });

    test("keeps health checks and CORS preflights outside the quota", async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const health = await fetch(`${origin}/health`, {
                headers: headers(),
            });

            expect(health.status).toBe(200);
            expect(health.headers.get("RateLimit-Limit")).toBeNull();
        }

        const first = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });
        const second = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });
        const blocked = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });
        const healthy = await fetch(`${origin}/health`, { headers: headers() });
        const preflight = await fetch(`${origin}/meta/latest`, {
            headers: {
                ...headers(),
                "Access-Control-Request-Method": "GET",
                Origin: "https://example.com",
            },
            method: "OPTIONS",
        });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(blocked.status).toBe(429);
        expect(healthy.status).toBe(200);
        expect(preflight.status).toBe(204);
    });

    test("counts writes in the general request quota", async () => {
        const first = await fetch(`${origin}/artists/test/request`, {
            headers: headers(),
            method: "POST",
        });
        const second = await fetch(`${origin}/artists/test/request`, {
            headers: headers(),
            method: "POST",
        });
        const blocked = await fetch(`${origin}/meta/latest`, {
            headers: headers(),
        });

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(blocked.status).toBe(429);
    });
});
