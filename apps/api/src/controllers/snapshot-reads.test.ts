import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtistsController } from "./artists-controller";
import { MetaController } from "./meta-controller";
import { createResponse } from "./test-helpers";

vi.mock("../config", () => ({
    loadPocketBaseConfig: () => ({
        email: "owner@example.com",
        password: "test-password",
        url: "http://pocketbase.invalid",
    }),
}));
vi.mock("../analytics", () => ({
    artistRequested: vi.fn(),
    searchQueryEntered: vi.fn(),
}));

const id = "1111111111111111111111";
const token = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;

afterEach(() => vi.unstubAllGlobals());

describe("PocketBase snapshot route contracts", () => {
    it("preserves the single snapshot route envelope and actual capture time", async () => {
        mockRecords([
            {
                artist: "111111111111111",
                capturedAt: "2026-01-07 12:00:00.000Z",
                followers: -1,

                id: "111111111111111",
                monthlyListeners: 0,
                popularity: -1,
                weekStart: "2026-01-05 00:00:00.000Z",
            },
        ]);
        const response = createResponse();
        const request = {
            params: { id },
            query: { ids: id, resolution: "weekly" },
        } as unknown as Request;

        await ArtistsController.getArtistSnapshots(request, response.value);

        expect(response.json).toHaveBeenCalledWith({
            data: [
                {
                    capturedAt: "2026-01-07T12:00:00.000Z",
                    followers: null,
                    id,
                    monthlyListeners: 0,
                    popularity: null,
                    timestamp: "2026-01-05T00:00:00.000Z",
                },
            ],
            error: null,
        });
    });

    it("preserves the multiple snapshot route envelope and actual capture time", async () => {
        mockRecords([
            {
                artist: "111111111111111",
                capturedAt: "2026-01-07 12:00:00.000Z",
                followers: -1,

                id: "111111111111111",
                monthlyListeners: 0,
                popularity: -1,
                weekStart: "2026-01-05 00:00:00.000Z",
            },
        ]);
        const response = createResponse();
        const request = {
            params: { id },
            query: { ids: id, resolution: "weekly" },
        } as unknown as Request;

        await ArtistsController.listArtistSnapshots(request, response.value);

        expect(response.json).toHaveBeenCalledWith({
            data: [
                {
                    capturedAt: "2026-01-07T12:00:00.000Z",
                    followers: null,
                    id,
                    monthlyListeners: 0,
                    popularity: null,
                    timestamp: "2026-01-05T00:00:00.000Z",
                },
            ],
            error: null,
        });
    });

    it.each([undefined, null])(
        "defaults a missing resolution %j to monthly",
        async (resolution) => {
            mockRecords([
                {
                    artist: "111111111111111",
                    capturedAt: "2026-01-07 12:00:00.000Z",
                    followers: -1,

                    id: "111111111111111",
                    monthlyListeners: 0,
                    popularity: -1,
                    weekStart: "2026-01-05 00:00:00.000Z",
                },
            ]);
            const response = createResponse();

            await ArtistsController.getArtistSnapshots(
                { params: { id }, query: { resolution } } as unknown as Request,
                response.value
            );

            expect(response.json).toHaveBeenCalledWith({
                data: [
                    expect.objectContaining({
                        timestamp: "2026-01-01T00:00:00.000Z",
                    }),
                ],
                error: null,
            });
        }
    );

    it("preserves the global freshness envelope with the actual capture timestamp", async () => {
        mockRecords([{ capturedAt: "2026-01-07 12:34:56.000Z" }]);
        const response = createResponse();

        await MetaController.latest({} as Request, response.value);

        expect(response.json).toHaveBeenCalledWith({
            data: { timestamp: "2026-01-07T12:34:56.000Z" },
            error: null,
        });
    });

    it("returns the existing not-found response for empty history", async () => {
        mockRecords([]);
        const response = createResponse();

        await MetaController.latest({} as Request, response.value);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(response.json).toHaveBeenCalledWith({
            data: null,
            error: expect.objectContaining({
                message: "Latest data could not be found",
            }),
        });
    });

    it.each([
        { id: "invalid", resolution: "weekly" },
        { id: `${id},${id}`, resolution: "weekly" },
        { id, resolution: "invalid" },
        { id, resolution: ["weekly"] },
    ])(
        "rejects invalid single-artist input %j before fetching",
        async (input) => {
            const fetch = mockRecords([]);
            const response = createResponse();
            const request = {
                params: { id: input.id },
                query: { resolution: input.resolution },
            } as unknown as Request;

            await expect(
                ArtistsController.getArtistSnapshots(request, response.value)
            ).rejects.toMatchObject({ name: "ERROR_VALIDATION" });

            expect(fetch).not.toHaveBeenCalled();
        }
    );
});

const mockRecords = (items: unknown[]) => {
    const fetch = vi.fn(async (url: string) => {
        if (url.includes("auth-with-password")) {
            return Response.json({ record: { id: "owner" }, token });
        }

        return Response.json({
            items: url.includes("/collections/artists/")
                ? [{ id: "111111111111111", spotifyId: id }]
                : items,
            page: 1,
            perPage: 500,
            totalItems: -1,
            totalPages: -1,
        });
    });
    vi.stubGlobal("fetch", fetch);

    return fetch;
};
