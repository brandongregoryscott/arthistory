import type { Express } from "express";
import type * as rateLimitModule from "express-rate-limit";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import posthog from "posthog-js";
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

// Lower only the general quota; use the real limiter, store, and HTTP router.
vi.mock("express-rate-limit", async (importOriginal) => {
    const actual = await importOriginal<typeof rateLimitModule>();
    return {
        ...actual,
        default: (options: Parameters<typeof actual.default>[0]) =>
            actual.default({
                ...options,
                max: options?.max === 1000 ? 2 : options?.max,
            }),
    };
});

let app: Express;
let server: Server | undefined;
let origin: string;
let readRateLimiter: rateLimitModule.RateLimitRequestHandler;

const client = "198.51.100.10";
const otherClient = "198.51.100.11";
const headers = (ip = client, prefix = "203.0.113.1") => ({
    "X-Forwarded-For": `${prefix}, ${ip}`,
});

beforeAll(async () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "1");
    vi.spyOn(posthog, "init").mockImplementation(() => posthog);
    const { MetaController } = await import("./controllers/meta-controller.js");
    vi.spyOn(MetaController, "latest").mockImplementation(
        async (_request, response) => response.json({ ok: true })
    );
    const { ArtistsController } =
        await import("./controllers/artists-controller.js");
    vi.spyOn(ArtistsController, "requestArtist").mockImplementation(
        async (_request, response) => response.json({ ok: true })
    );
    ({ app } = await import("./app.js"));
    ({ readRateLimiter } = await import("./utilities/rate-limiter.js"));
    const activeServer = app.listen(0, "127.0.0.1");
    server = activeServer;
    await new Promise<void>((resolve, reject) => {
        activeServer.once("listening", resolve);
        activeServer.once("error", reject);
    });
    origin = `http://127.0.0.1:${(activeServer.address() as AddressInfo).port}`;
});

beforeEach(() => {
    for (const ip of [
        client,
        otherClient,
        "127.0.0.1",
        "203.0.113.1",
        "203.0.113.2",
        "203.0.113.3",
    ]) {
        readRateLimiter.resetKey(ip);
    }
    vi.clearAllMocks();
});

afterAll(async () => {
    if (server?.listening === true) {
        const activeServer = server;
        await new Promise<void>((resolve, reject) =>
            activeServer.close((error) =>
                error != null ? reject(error) : resolve()
            )
        );
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe("application rate limiting", () => {
    it("ignores forged forwarding headers when running without a proxy", async () => {
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

    it("limits successful reads and preserves the 429 response contract", async () => {
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

    it("uses only the nearest forwarded client and keeps clients independent", async () => {
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

    it("keeps health checks and CORS preflights outside the quota", async () => {
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

    it("counts writes in the general request quota", async () => {
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
