import type { Artist, ArtistWithTrackingStatus } from "@repo/common";
import { loadPocketBaseConfig } from "../config";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistCache } from "./artist-cache";

type ListArtistsOptions = { ids: string[] };

type ArtistSearchPage = { artists: ArtistWithTrackingStatus[]; total: number };

const artistCache = new ArtistCache({
    client: new PocketBaseClient(loadPocketBaseConfig()),
});

class ArtistService {
    static async listArtists(
        options: ListArtistsOptions
    ): Promise<Record<string, Artist>> {
        return artistCache.list(options.ids);
    }

    static async searchArtists(name: string): Promise<ArtistSearchPage> {
        const artists = artistCache.search(name);

        return { artists, total: artists.length };
    }
}

export { artistCache, ArtistService };
