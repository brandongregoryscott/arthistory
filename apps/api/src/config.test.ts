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
