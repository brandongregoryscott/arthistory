import type { ArtistSnapshot, SnapshotResolution } from "@repo/common";
import { bucketSnapshots, ValidationError } from "@repo/common";
import { isEmpty, uniq } from "lodash";
import type { PocketBaseClient } from "../storage/pocketbase";
import { MISSING_METRIC } from "../../../../pocketbase/hooks/snapshot-metrics.cjs";
import {
    isPocketBaseRecordId,
    isSpotifyArtistId,
} from "../utilities/id-validation";

type ArtistIdentityRecord = {
    id: string;
    spotifyId: string;
};

type SnapshotRecord = {
    artist: string;
    capturedAt: string;
    followers: number;
    id: string;
    monthlyListeners: number;
    popularity: number;
    weekStart: string;
};

type ListSnapshotsOptions = {
    ids: string[];
    resolution?: SnapshotResolution;
};

type ArtistSnapshotStoreOptions = {
    client: PocketBaseClient;
    maxSnapshots?: number;
};

const MAX_ARTISTS_PER_REQUEST = 50;
const PAGE_SIZE = 500;
const MAX_SNAPSHOTS = 50000;
const READ_TIMEOUT_MS = 10000;

class ArtistSnapshotStore {
    readonly #client: PocketBaseClient;
    readonly #maxSnapshots: number;

    constructor({
        client,
        maxSnapshots = MAX_SNAPSHOTS,
    }: ArtistSnapshotStoreOptions) {
        if (!Number.isSafeInteger(maxSnapshots) || maxSnapshots < 1) {
            throw new Error("Snapshot read limit must be a positive integer.");
        }

        this.#client = client;
        this.#maxSnapshots = maxSnapshots;
    }

    async latest(): Promise<Pick<ArtistSnapshot, "timestamp"> | undefined> {
        const result = await this.#client.run((pb) =>
            pb.collection("snapshots").getList<SnapshotRecord>(1, 1, {
                fields: "capturedAt",
                sort: "-capturedAt",
            })
        );
        const [record] = result.items;

        return record == null
            ? undefined
            : { timestamp: new Date(record.capturedAt).toISOString() };
    }

    async list({ ids, resolution = "monthly" }: ListSnapshotsOptions) {
        const requestedIds = uniq(ids);
        if (
            requestedIds.length > MAX_ARTISTS_PER_REQUEST ||
            requestedIds.some((id) => !isSpotifyArtistId(id))
        ) {
            throw new ValidationError(
                `Provide at most ${MAX_ARTISTS_PER_REQUEST} valid Spotify artist IDs.`
            );
        }
        if (isEmpty(requestedIds)) {
            return [];
        }

        const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
        const snapshots: ArtistSnapshot[] = [];
        const artists = await this.#client.run((pb) =>
            pb
                .collection("artists")
                .getList<ArtistIdentityRecord>(1, MAX_ARTISTS_PER_REQUEST, {
                    fields: "id,spotifyId",
                    filter: requestedIds
                        .map((id) => pb.filter("spotifyId = {:id}", { id }))
                        .join(" || "),
                    signal,
                    skipTotal: true,
                    sort: "spotifyId",
                })
        );
        const seen = new Set<string>();

        for (const artist of artists.items) {
            if (
                !isPocketBaseRecordId(artist.id) ||
                !requestedIds.includes(artist.spotifyId) ||
                seen.has(artist.spotifyId)
            ) {
                throw new Error(
                    "Snapshot lookup returned an invalid artist identity."
                );
            }
            seen.add(artist.spotifyId);
            let cursor = "";

            while (true) {
                const page = await this.#client.run((pb) => {
                    const filters = [
                        pb.filter("artist = {:id}", { id: artist.id }),
                    ];
                    if (cursor !== "") {
                        filters.push(
                            pb.filter("weekStart > {:cursor}", { cursor })
                        );
                    }

                    return pb
                        .collection("snapshots")
                        .getList<SnapshotRecord>(1, PAGE_SIZE, {
                            fields: "id,artist,weekStart,capturedAt,followers,monthlyListeners,popularity",
                            filter: filters.join(" && "),
                            signal,
                            skipTotal: true,
                            sort: "weekStart",
                        });
                });

                for (const record of page.items) {
                    if (record.artist !== artist.id) {
                        throw new Error(
                            "Snapshot has no matching artist relation."
                        );
                    }
                    if (
                        !Number.isFinite(Date.parse(record.weekStart)) ||
                        (cursor !== "" &&
                            Date.parse(record.weekStart) <=
                                Date.parse(cursor)) ||
                        snapshots.length >= this.#maxSnapshots
                    ) {
                        throw new Error(
                            "Snapshot pagination exceeded its read limit or did not advance."
                        );
                    }

                    cursor = record.weekStart;
                    snapshots.push({
                        capturedAt: new Date(record.capturedAt).toISOString(),
                        followers:
                            record.followers === MISSING_METRIC
                                ? null
                                : record.followers,
                        id: artist.spotifyId,
                        monthlyListeners:
                            record.monthlyListeners === MISSING_METRIC
                                ? null
                                : record.monthlyListeners,
                        popularity:
                            record.popularity === MISSING_METRIC
                                ? null
                                : record.popularity,
                        timestamp: new Date(record.weekStart).toISOString(),
                    });
                }

                if (page.items.length < PAGE_SIZE) {
                    break;
                }
            }
        }

        return bucketSnapshots(snapshots, resolution);
    }
}

export { ArtistSnapshotStore };
