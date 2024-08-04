import type {
    ArtistRow,
    ArtistSnapshot,
    ArtistSnapshotRow,
} from "@repo/common";
import { Artist } from "@repo/common";
import { getDb } from "../database";
import {
    fromUnixTime,
    getDayOfYear,
    getMonth,
    getQuarter,
    getWeek,
    getYear,
} from "date-fns";
import { uniqBy } from "lodash";

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
    ): Promise<Record<string, ArtistRow>> => {
        const { ids } = options;
        const db = await getDb();
        const results = await db.all<ArtistRow[]>(
            `SELECT * FROM artists WHERE id IN (${queryPlaceholder(ids.length)});`,
            ids
        );

        const result = ids.reduce(
            (accumulated, id) => {
                const result = results.find((result) => result.id === id);
                if (result === undefined) {
                    return accumulated;
                }
                return {
                    ...accumulated,
                    [id]: result,
                };
            },
            {} as Record<string, ArtistRow>
        );

        return result;
    },
    listArtistSnapshots: async (
        options: ListArtistSnapshotsOptions
    ): Promise<ArtistSnapshot[]> => {
        const { ids, resolution } = options;
        const db = await getDb();
        const results = await db.all<ArtistSnapshotRow[]>(
            `SELECT * FROM artist_snapshots WHERE id IN (${queryPlaceholder(ids.length)});`,
            ids
        );
        let snapshots = results.map(normalizeArtistSnapshot);

        switch (resolution) {
            case "yearly":
                snapshots = uniqBy(
                    snapshots,
                    (snapshot) =>
                        `${snapshot.id}_${getYear(snapshot.timestamp)}`
                );
                break;
            case "quarterly":
                snapshots = uniqBy(
                    snapshots,
                    (snapshot) =>
                        `${snapshot.id}_${getQuarter(snapshot.timestamp)}`
                );
                break;
            case "monthly":
                snapshots = uniqBy(
                    snapshots,
                    (snapshot) =>
                        `${snapshot.id}_${getMonth(snapshot.timestamp)}`
                );
                break;
            case "daily":
                snapshots = uniqBy(
                    snapshots,
                    (snapshot) =>
                        `${snapshot.id}_${getDayOfYear(snapshot.timestamp)}`
                );
                break;
            case "weekly":
            default:
                snapshots = uniqBy(
                    snapshots,
                    (snapshot) =>
                        `${snapshot.id}_${getWeek(snapshot.timestamp)}`
                );
        }

        return snapshots;
    },
};

const queryPlaceholder = (count: number): string =>
    "?".repeat(count).split("").join(",");

const normalizeArtistSnapshot = (row: ArtistSnapshotRow): ArtistSnapshot => ({
    ...row,
    timestamp: fromUnixTime(row.timestamp).toISOString(),
});

export type { Resolution };
export { ArtistService };
