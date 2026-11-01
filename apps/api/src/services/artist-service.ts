import type { Artist, ArtistSnapshot, ArtistSnapshotRow } from "@repo/common";
import { getDayOfYear, getMonth, getQuarter, getWeek, getYear } from "date-fns";
import { uniqBy } from "lodash";
import { getDb } from "../database";
import { SpotifyClient } from "../spotify";
import { normalizeTimestamp } from "../utilities/date-utils";

type ListArtistSnapshotsOptions = {
    ids: string[];
    resolution?: Resolution;
};

type ListArtistsOptions = {
    ids: string[];
};

type Resolution = "daily" | "monthly" | "quarterly" | "weekly" | "yearly";

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

        // Spotify removed the batch Get Several Artists endpoint (GET /v1/artists?ids=...)
        // for apps created after Feb 11, 2026. Use individual artist fetches instead.
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
        const db = await getDb();
        const results = await db.all<ArtistSnapshotRow[]>(
            `SELECT * FROM artist_snapshots WHERE id IN (${queryPlaceholder(ids.length)}) ORDER BY timestamp ASC;`,
            ids
        );
        const snapshots = results.map(normalizeArtistSnapshot);

        switch (resolution) {
            case "daily":
                return sampleArtistSnapshots(snapshots, getDayOfYear);
            case "quarterly":
                return sampleArtistSnapshots(snapshots, getQuarter);
            case "weekly":
                return sampleArtistSnapshots(snapshots, getWeek);
            case "yearly":
                return sampleArtistSnapshots(snapshots, getYear);
            case "monthly":
            default:
                return sampleArtistSnapshots(snapshots, getMonth);
        }
    },
};

const queryPlaceholder = (count: number): string =>
    "?".repeat(count).split("").join(",");

const normalizeArtistSnapshot = (row: ArtistSnapshotRow): ArtistSnapshot => ({
    ...row,
    timestamp: normalizeTimestamp(row.timestamp),
});

const sampleArtistSnapshots = (
    snapshots: ArtistSnapshot[],
    getInterval: (timestamp: string) => number
): ArtistSnapshot[] => {
    // Each artist has its own collection schedule. Keep its observations even
    // when another selected artist has no data on the same day.
    return uniqBy(
        snapshots,
        (snapshot) =>
            `${snapshot.id}_${getYear(snapshot.timestamp)}_${getInterval(snapshot.timestamp)}`
    );
};

export type { Resolution };
export { ArtistService };
