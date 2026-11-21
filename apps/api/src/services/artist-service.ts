import type {
    Artist,
    ArtistSnapshot,
    ArtistSnapshotRow,
    ArtistWithTrackingStatus,
    SnapshotResolution,
} from "@repo/common";
import { getDayOfYear, getMonth, getQuarter, getWeek, getYear } from "date-fns";
import { countBy, uniqBy } from "lodash";
import { ArtistCache } from "../artists/artist-cache";
import { ARTIST_METADATA_SOURCE, loadPocketBaseConfig } from "../config";
import { getDb } from "../database";
import { artistSnapshotStore } from "../snapshots";
import { PocketBaseClient } from "../storage/pocketbase";
import { normalizeTimestamp } from "../utilities/date-utils";

type ListArtistSnapshotsOptions = {
    ids: string[];
    resolution?: SnapshotResolution;
};

type ListArtistsOptions = {
    ids: string[];
};

type ArtistSearchPage = {
    artists: ArtistWithTrackingStatus[];
    total: number;
};

const artistCache =
    ARTIST_METADATA_SOURCE === "pocketbase"
        ? new ArtistCache({
              client: new PocketBaseClient(loadPocketBaseConfig()),
          })
        : undefined;

const ArtistService = {
    isTracked: async (ids: string[]): Promise<Record<string, boolean>> => {
        const db = await getDb();
        const results = await db.all<ArtistSnapshot[]>(
            `SELECT id FROM artist_snapshots WHERE id IN (${queryPlaceholder(ids.length)}) GROUP BY id;`,
            ids
        );
        const result: Record<string, boolean> = ids.reduce(
            (accumulated, id) => ({
                ...accumulated,
                [id]: results.some((artist) => artist.id === id),
            }),
            {}
        );

        return result;
    },
    listArtists: async (
        options: ListArtistsOptions
    ): Promise<Record<string, Artist>> => {
        const { ids } = options;

        if (artistCache != null) {
            return artistCache.list(ids);
        }

        const { SpotifyClient } = await import("../spotify.js");

        const artists = await Promise.all(
            ids.map((id) => SpotifyClient.artists.get(id))
        );

        const result: Record<string, Artist> = artists.reduce(
            (accumulated, artist) => ({ ...accumulated, [artist.id]: artist }),
            {}
        );

        return result;
    },
    listArtistSnapshots: async (
        options: ListArtistSnapshotsOptions
    ): Promise<ArtistSnapshot[]> => {
        const { ids, resolution } = options;
        if (artistSnapshotStore != null) {
            return artistSnapshotStore.list({ ids, resolution });
        }

        const db = await getDb();
        const results = await db.all<ArtistSnapshotRow[]>(
            `SELECT * FROM artist_snapshots WHERE id IN (${queryPlaceholder(ids.length)}) ORDER BY timestamp ASC;`,
            ids
        );
        let snapshots = results.map(normalizeArtistSnapshot);

        switch (resolution) {
            case "daily":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getDayOfYear
                );
            case "quarterly":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getQuarter
                );
            case "weekly":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getWeek
                );
            case "yearly":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getYear
                );
            case "monthly":
            default:
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getMonth
                );
        }
    },
    searchArtists: async (name: string): Promise<ArtistSearchPage> => {
        if (artistCache != null) {
            const artists = artistCache.search(name);

            return { artists, total: artists.length };
        }

        const { SpotifyClient } = await import("../spotify.js");
        const result = await SpotifyClient.search(name, ["artist"]);
        const tracked = await ArtistService.isTracked(
            result.artists.items.map((artist) => artist.id)
        );

        return {
            artists: result.artists.items.map((artist) => ({
                ...artist,
                external_urls: { ...artist.external_urls },
                isTracked: tracked[artist.id] === true,
            })),
            total: result.artists.total,
        };
    },
};

const queryPlaceholder = (count: number): string =>
    "?".repeat(count).split("").join(",");

const normalizeArtistSnapshot = (row: ArtistSnapshotRow): ArtistSnapshot => ({
    ...row,
    timestamp: normalizeTimestamp(row.timestamp),
});

const intersectionByNormalizedTimestamp = (
    count: number,
    snapshots: ArtistSnapshot[],
    getInterval: (timestamp: string) => number
): ArtistSnapshot[] => {
    const countByTimestamp = countBy(
        snapshots,
        (snapshot) => snapshot.timestamp
    );

    return uniqBy(
        snapshots.filter(
            (snapshot) => countByTimestamp[snapshot.timestamp] === count
        ),
        (snapshot) =>
            `${snapshot.id}_${getYear(snapshot.timestamp)}_${getInterval(snapshot.timestamp)}`
    );
};

export { artistCache, ArtistService };
