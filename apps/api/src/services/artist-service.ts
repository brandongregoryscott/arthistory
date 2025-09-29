import type { Artist, ArtistSnapshot, ArtistSnapshotRow } from "@repo/common";
import { getDb } from "../database";
import { getDayOfYear, getMonth, getQuarter, getWeek, getYear } from "date-fns";
import { countBy, uniqBy } from "lodash";
import { SpotifyClient } from "../spotify";
import { normalizeTimestamp } from "../utilities/date-utils";

interface ListArtistSnapshotsOptions {
    ids: string[];
    resolution?: Resolution;
}

interface ListArtistsOptions {
    ids: string[];
}

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

        const artists = await SpotifyClient.artists.get(ids);

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
        let snapshots = results.map(normalizeArtistSnapshot);

        switch (resolution) {
            case "yearly":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getYear
                );
            case "quarterly":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getQuarter
                );
            case "monthly":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getMonth
                );
            case "daily":
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getDayOfYear
                );
            case "weekly":
            default:
                return intersectionByNormalizedTimestamp(
                    ids.length,
                    snapshots,
                    getWeek
                );
        }
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
        (snapshot) => `${snapshot.id}_${getInterval(snapshot.timestamp)}`
    );
};

export type { Resolution };
export { ArtistService };
