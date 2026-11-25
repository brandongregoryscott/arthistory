import { afterEach, describe, expect, it, vi } from "vitest";
import { PocketBaseClient } from "./pocketbase";

const config = {
    email: "owner@example.com",
    password: "test-password",
    url: "http://pocketbase:8090",
};

// The SDK checks the JWT's expiry locally.
const TOKEN = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;

const authResponse = async () =>
    Response.json({
        record: { email: config.email, id: "owner" },
        token: TOKEN,
    });

const pageResponse = async () =>
    Response.json({
        items: [],
        page: 1,
        perPage: 1,
        totalItems: 0,
        totalPages: 0,
    });

describe("PocketBaseClient", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("shares authentication and doesn't cancel concurrent paginated reads", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(authResponse)
            .mockImplementation(pageResponse);

        vi.stubGlobal("fetch", fetchMock);

        const storage = new PocketBaseClient(config);

        await Promise.all(
            [1, 2].map(() =>
                storage.run((pb) => pb.collection("artists").getList(1, 1))
            )
        );

        const requests = fetchMock.mock.calls;

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(requests[1]?.[1].headers.Authorization).toBe(TOKEN);
        expect(requests[2]?.[1].signal.aborted).toBe(false);
    });

    it("reauthenticates once on rejection, but never retries ambiguous writes", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(authResponse)
            .mockResolvedValueOnce(Response.json({}, { status: 401 }))
            .mockImplementationOnce(authResponse)
            .mockImplementationOnce(pageResponse)
            .mockRejectedValueOnce(new Error("connection lost"));

        vi.stubGlobal("fetch", fetchMock);

        const storage = new PocketBaseClient(config);

        await storage.run((pb) => pb.collection("artists").getList(1, 1));

        await expect(
            storage.run((pb) => pb.collection("artists").create({}))
        ).rejects.toThrow();

        expect(fetchMock).toHaveBeenCalledTimes(5);
    });

    it("allows authentication to recover after a failed attempt", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(Response.json({}, { status: 400 }))
            .mockImplementationOnce(authResponse)
            .mockImplementationOnce(pageResponse);

        vi.stubGlobal("fetch", fetchMock);

        const storage = new PocketBaseClient(config);

        await expect(
            storage.run((pb) => pb.collection("artists").getList(1, 1))
        ).rejects.toThrow();

        await storage.run((pb) => pb.collection("artists").getList(1, 1));

        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("checks each required collection using bounded record reads", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(authResponse)
            .mockImplementation(pageResponse);

        vi.stubGlobal("fetch", fetchMock);

        await new PocketBaseClient(config).ready();

        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(fetchMock.mock.calls[4]?.[0]).toContain("/sync_state/records?");
    });
});
