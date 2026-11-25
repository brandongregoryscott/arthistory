import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResponse } from "../../test/test-utils";
import { ArtistsController } from "./artist-controller";
import { ArtistSearchIndex } from "./artist-search-index";

const cache = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }));

vi.mock("../config", () => ({
    loadPocketBaseConfig: () => ({
        email: "owner@example.com",
        password: "test-password",
        url: "http://pocketbase.invalid",
    }),
}));
vi.mock("../artists/artist-cache", () => ({
    ArtistCache: class {
        list = cache.list;
        search = cache.search;
    },
}));
vi.mock("../analytics", () => ({
    artistRequested: vi.fn(),
    searchQueryEntered: vi.fn(),
}));

const spotifyId = "1111111111111111111111";

beforeEach(() => {
    vi.clearAllMocks();
    const index = new ArtistSearchIndex();
    index.add({
        aliases: ["Dust"],
        displayName: "Duster",
        id: "111111111111111",
        spotifyId,
        syncEnabled: false,
    });
    index.markHistory("111111111111111");
    index.finish();
    cache.list.mockImplementation((ids: string[]) => index.list(ids));
    cache.search.mockImplementation((query: string) => index.search(query));
});

describe("local artist metadata controllers", () => {
    it("keeps the search envelope and reports history independently of enrollment without Spotify", async () => {
        const response = createResponse();

        await ArtistsController.searchArtistsByName(
            { query: { name: "Dustr" } } as unknown as Request,
            response.value
        );

        expect(response.json).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    hasHistory: true,
                    id: spotifyId,
                    isTracked: true,
                    name: "Duster",
                    syncEnabled: false,
                }),
            ],
            error: null,
        });
    });

    it("reads stored display names and preserves missing audience metrics", async () => {
        const response = createResponse();

        await ArtistsController.listArtists(
            { query: { ids: spotifyId } } as unknown as Request,
            response.value
        );

        expect(response.json).toHaveBeenCalledWith({
            data: {
                [spotifyId]: expect.objectContaining({
                    followers: { href: null, total: null },
                    name: "Duster",
                    popularity: null,
                }),
            },
            error: null,
        });
    });

    it("leaves public artist requests as analytics-only operations", async () => {
        const response = createResponse();

        await ArtistsController.requestArtist(
            { params: { id: spotifyId } } as unknown as Request,
            response.value
        );

        expect(response.json).toHaveBeenCalledWith({
            data: { requested: true },
            error: null,
        });
        expect(cache.search).not.toHaveBeenCalled();
        expect(cache.list).not.toHaveBeenCalled();
    });

    it.each([undefined, ["Duster"], "x".repeat(101)])(
        "rejects invalid search input %j before searching",
        async (name) => {
            const response = createResponse();

            await expect(
                ArtistsController.searchArtistsByName(
                    { query: { name } } as unknown as Request,
                    response.value
                )
            ).rejects.toMatchObject({ name: "ERROR_VALIDATION" });

            expect(cache.search).not.toHaveBeenCalled();
        }
    );

    it.each([
        undefined,
        "bad-id",
        Array.from({ length: 51 }, (_, number) =>
            String(number).padStart(22, "0")
        ).join(","),
    ])("rejects invalid lookup IDs %j before reading metadata", async (ids) => {
        const response = createResponse();

        await expect(
            ArtistsController.listArtists(
                { query: { ids } } as unknown as Request,
                response.value
            )
        ).rejects.toMatchObject({ name: "ERROR_VALIDATION" });

        expect(cache.list).not.toHaveBeenCalled();
    });
});
