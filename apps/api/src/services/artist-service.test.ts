import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtistService } from "./artist-service";

const spotify = vi.hoisted(() => ({ get: vi.fn(), search: vi.fn() }));

vi.mock("../config", () => ({ ARTIST_METADATA_SOURCE: "spotify" }));
vi.mock("../storage/pocketbase", () => ({
    PocketBaseClient: class {
        constructor() {
            throw new Error("Legacy metadata must not initialize PocketBase.");
        }
    },
}));
vi.mock("../spotify", () => ({
    SpotifyClient: { artists: { get: spotify.get }, search: spotify.search },
}));
vi.mock("../database", () => ({
    getDb: async () => ({
        all: async () => [{ id: "1111111111111111111111" }],
    }),
}));

const artist = {
    external_urls: {
        spotify: "https://open.spotify.com/artist/1111111111111111111111",
    },
    followers: { href: null, total: 10000 },
    genres: [],
    id: "1111111111111111111111",
    images: [],
    name: "Duster",
    popularity: 42,
    uri: "spotify:artist:1111111111111111111111",
};

beforeEach(() => {
    vi.clearAllMocks();
    spotify.get.mockResolvedValue(artist);
    spotify.search.mockResolvedValue({
        artists: { items: [artist], total: 500 },
    });
});

describe("legacy artist metadata compatibility", () => {
    it("keeps the search total for existing analytics while adding history availability", async () => {
        const result = await ArtistService.searchArtists("Duster");

        expect(result).toEqual({
            artists: [{ ...artist, isTracked: true }],
            total: 500,
        });
    });

    it("keeps existing display lookups without requiring PocketBase configuration", async () => {
        const result = await ArtistService.listArtists({ ids: [artist.id] });

        expect(result).toEqual({ [artist.id]: artist });
        expect(spotify.get).toHaveBeenCalledWith(artist.id);
    });
});
