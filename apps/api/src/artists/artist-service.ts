import type {
    Artist,
    ArtistSnapshot,
    ArtistWithTrackingStatus,
    SnapshotResolution,
} from "@repo/common";
import { loadPocketBaseConfig } from "../config";
import { artistSnapshotStore } from "../snapshots";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistCache } from "./artist-cache";

type ListArtistSnapshotsOptions = {
    ids: string[];
    resolution?: SnapshotResolution;
};

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
    static async listArtistSnapshots(
        options: ListArtistSnapshotsOptions
    ): Promise<ArtistSnapshot[]> {
        return artistSnapshotStore.list(options);
    }
    static async searchArtists(name: string): Promise<ArtistSearchPage> {
        const artists = artistCache.search(name);
        return { artists, total: artists.length };
    }
}

export { artistCache, ArtistService };
