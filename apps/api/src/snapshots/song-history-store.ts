import type { SongHistoryObservation } from "@repo/common";
import { ValidationError } from "@repo/common";
import type { PocketBaseClient } from "../storage/pocketbase";
import { MISSING_METRIC } from "../../../../pocketbase/hooks/constants.js";
import {
    isPocketBaseRecordId,
    isSpotifyArtistId,
} from "../utilities/validation";

type RecordRow = {
    artist: string;
    capturedAt: string;
    expand?: { song?: { spotifyId: string } };
    id: string;
    listenCount: number;
    name: string;
    song: string;
    weekStart: string;
};

class SongHistoryStore {
    constructor(private readonly client: PocketBaseClient) {}

    async list(id: string): Promise<SongHistoryObservation[]> {
        if (!isSpotifyArtistId(id)) {
            throw new ValidationError("Provide a Spotify artist ID.");
        }

        const signal = AbortSignal.timeout(10000);
        const artists = await this.client.run((pb) =>
            pb
                .collection("artists")
                .getList<{ id: string; spotifyId: string }>(1, 1, {
                    fields: "id,spotifyId",
                    filter: pb.filter("spotifyId = {:id}", { id }),
                    signal,
                })
        );
        const [artist] = artists.items;

        if (artist == null) {
            return [];
        }

        if (!isPocketBaseRecordId(artist.id) || artist.spotifyId !== id) {
            throw new Error("Invalid song history artist identity.");
        }

        const result: SongHistoryObservation[] = [];
        let cursor = "";

        // Cursor by record ID avoids skipping songs sharing a week.
        while (true) {
            const page = await this.client.run((pb) =>
                pb.collection("song_snapshots").getList<RecordRow>(1, 500, {
                    expand: "song",
                    fields: "id,artist,song,name,weekStart,capturedAt,listenCount,expand.song.spotifyId",
                    filter: pb.filter("artist = {:artist} && id > {:cursor}", {
                        artist: artist.id,
                        cursor,
                    }),
                    signal,
                    skipTotal: true,
                    sort: "id",
                })
            );

            for (const row of page.items) {
                const spotifyId = row.expand?.song?.spotifyId;

                if (
                    row.artist !== artist.id ||
                    !isPocketBaseRecordId(row.id) ||
                    row.id <= cursor ||
                    !isPocketBaseRecordId(row.song) ||
                    !isSpotifyArtistId(spotifyId) ||
                    !Number.isFinite(Date.parse(row.weekStart)) ||
                    !Number.isFinite(Date.parse(row.capturedAt)) ||
                    typeof row.name !== "string" ||
                    !Number.isSafeInteger(row.listenCount) ||
                    row.listenCount < MISSING_METRIC ||
                    result.length >= 50000
                ) {
                    throw new Error(
                        "Invalid song observation or history read limit exceeded."
                    );
                }

                cursor = row.id;
                result.push({
                    capturedAt: new Date(row.capturedAt).toISOString(),
                    listenCount:
                        row.listenCount === MISSING_METRIC
                            ? null
                            : row.listenCount,
                    name: row.name,
                    spotifyId,
                    timestamp: new Date(row.weekStart).toISOString(),
                });
            }

            if (page.items.length < 500) {
                break;
            }
        }

        return result.sort((a, b) => {
            const timestamp = a.timestamp.localeCompare(b.timestamp);

            return timestamp !== 0
                ? timestamp
                : a.spotifyId.localeCompare(b.spotifyId);
        });
    }
}

export { SongHistoryStore };
