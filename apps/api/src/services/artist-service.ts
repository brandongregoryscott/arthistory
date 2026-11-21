import type {
    Artist,
    ArtistSnapshot,
    ArtistWithTrackingStatus,
    SnapshotResolution,
} from "@repo/common";
import { ArtistCache } from "../artists/artist-cache";
import { loadPocketBaseConfig } from "../config";
import { artistSnapshotStore } from "../snapshots";
import { PocketBaseClient } from "../storage/pocketbase";

type ListArtistSnapshotsOptions = {
    ids: string[];
    resolution?: SnapshotResolution;
};
type ListArtistsOptions = { ids: string[] };
type ArtistSearchPage = { artists: ArtistWithTrackingStatus[]; total: number };

const artistCache = new ArtistCache({
    client: new PocketBaseClient(loadPocketBaseConfig()),
});

const ArtistService = {
    listArtists: async ({
        ids,
    }: ListArtistsOptions): Promise<Record<string, Artist>> =>
        artistCache.list(ids),
    listArtistSnapshots: async (
        options: ListArtistSnapshotsOptions
    ): Promise<ArtistSnapshot[]> => artistSnapshotStore.list(options),
    searchArtists: async (name: string): Promise<ArtistSearchPage> => {
        const artists = artistCache.search(name);
        return { artists, total: artists.length };
    },
};

export { artistCache, ArtistService };
