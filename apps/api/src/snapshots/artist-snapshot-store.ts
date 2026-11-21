import type { ArtistSnapshot, SnapshotResolution } from "@repo/common";
import { bucketSnapshots, ValidationError } from "@repo/common";
import { isEmpty, uniq } from "lodash";
import type { PocketBaseClient } from "../storage/pocketbase";
import { MISSING_METRIC } from "../../../../pocketbase/hooks/snapshot-metrics.cjs";
import { isSpotifyArtistId } from "../utilities/id-validation";

type SnapshotRecord = {
    capturedAt: string;
    expand?: { artist?: { spotifyId: string } };
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
        let cursor = "";

        while (true) {
            const page = await this.#client.run((pb) => {
                const artists = requestedIds.map((id) =>
                    pb.filter("artist.spotifyId = {:id}", { id })
                );
                const filter = `(${artists.join(" || ")}) && ${pb.filter("id > {:cursor}", { cursor })}`;

                return pb
                    .collection("snapshots")
                    .getList<SnapshotRecord>(1, PAGE_SIZE, {
                        expand: "artist",
                        fields: "id,weekStart,capturedAt,followers,monthlyListeners,popularity,expand.artist.spotifyId",
                        filter,
                        signal,
                        skipTotal: true,
                        sort: "id",
                    });
            });

            for (const record of page.items) {
                const id = record.expand?.artist?.spotifyId;
                if (!isSpotifyArtistId(id) || !requestedIds.includes(id)) {
                    throw new Error(
                        "Snapshot has no matching artist relation."
                    );
                }
                if (
                    record.id <= cursor ||
                    snapshots.length >= this.#maxSnapshots
                ) {
                    throw new Error(
                        "Snapshot pagination exceeded its read limit or did not advance."
                    );
                }

                cursor = record.id;
                snapshots.push({
                    capturedAt: new Date(record.capturedAt).toISOString(),
                    followers:
                        record.followers === MISSING_METRIC
                            ? null
                            : record.followers,
                    id,
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
                return bucketSnapshots(snapshots, resolution);
            }
        }
    }
}

export { ArtistSnapshotStore };
