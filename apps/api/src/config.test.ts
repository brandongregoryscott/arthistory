import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllEnvs());

describe("trusted proxy configuration", () => {
    it("trusts no forwarding hops by default", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", undefined);

        const { TRUST_PROXY_HOPS } = await import("./config.js");

        expect(TRUST_PROXY_HOPS).toBe(0);
    });

    it("accepts the single HTTP tunnel hop", async () => {
        vi.stubEnv("TRUST_PROXY_HOPS", "1");

        const { TRUST_PROXY_HOPS } = await import("./config.js");

        expect(TRUST_PROXY_HOPS).toBe(1);
    });

    it.each(["-1", "1.5", "invalid", "Infinity", "9007199254740992"])(
        "rejects invalid proxy hop count %s",
        async (hops) => {
            vi.stubEnv("TRUST_PROXY_HOPS", hops);

            const configuration = import("./config.js");

            await expect(configuration).rejects.toThrow(
                "Invalid TRUST_PROXY_HOPS."
            );
        }
    );
});

describe("PocketBase configuration", () => {
    it("rejects incomplete configuration only when loaded", async () => {
        vi.stubEnv("POCKETBASE_URL", "https://pb.example.com");
        vi.stubEnv("POCKETBASE_SUPERUSER_EMAIL", "owner@example.com");
        vi.stubEnv("POCKETBASE_SUPERUSER_PASSWORD", "");

        const { loadPocketBaseConfig } = await import("./config.js");

        expect(loadPocketBaseConfig).toThrow();

        vi.stubEnv("POCKETBASE_SUPERUSER_PASSWORD", "test-password");

        expect(loadPocketBaseConfig().url).toBe("https://pb.example.com");
    });
});

describe("artist metadata configuration", () => {
    it("preserves the existing metadata backend by default", async () => {
        vi.stubEnv("ARTIST_METADATA_SOURCE", undefined);

        const { ARTIST_METADATA_SOURCE } = await import("./config.js");

        expect(ARTIST_METADATA_SOURCE).toBe("spotify");
    });

    it("accepts PocketBase explicitly and rejects unknown backends", async () => {
        vi.stubEnv("ARTIST_METADATA_SOURCE", "pocketbase");

        const { ARTIST_METADATA_SOURCE } = await import("./config.js");

        expect(ARTIST_METADATA_SOURCE).toBe("pocketbase");

        vi.resetModules();
        vi.stubEnv("ARTIST_METADATA_SOURCE", "other");

        await expect(import("./config.js")).rejects.toThrow(
            "Invalid ARTIST_METADATA_SOURCE."
        );
    });
});
