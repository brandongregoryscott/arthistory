import type { Artist, SpotifyApi } from "@spotify/web-api-ts-sdk";
import { ARTIST_ID_ALEX_G, ARTIST_ID_DUSTER } from "../constants/spotify";
import {
    countRows,
    createArtistSnapshotsTable,
    openDb,
    openSnapshotDb,
} from "../utils/db-utils";
import {
    buildCurrentSpotifyClient,
    buildRandomSpotifyClient,
    isRateLimitError,
} from "../utils/spotify-utils";
import type { SQLStatement } from "../types";
import {
    getCurrentHourIndex,
    getRoundedTimestamp,
    toUnixTimestampInSeconds,
} from "../utils/date-utils";
import {
    ARTIST_IDS_TABLE_NAME,
    ARTIST_SNAPSHOTS_TABLE_NAME,
} from "../constants/storage";
import type { Entity } from "@repo/common";
import { chunk, flatten, take } from "lodash";
import { sleep } from "../utils/core-utils";

/**
 * The maximum number of artist ids that can be requested at once via the Spotify API.
 */
const MAX_ARTIST_IDS_PER_REQUEST = 50;

/**
 * Maximum number of attempts to retry a request before giving up.
 */
const MAX_RETRY_ATTEMPTS = 10;

const sync = async () => {
    const timestamp = getRoundedTimestamp();

    const spotify = buildCurrentSpotifyClient();
    const db = await openSnapshotDb();
    await createArtistSnapshotsTable(db);

    const artistIds = take(await readArtistIds(), 3000);

    const artistIdChunks = chunk(artistIds, MAX_ARTIST_IDS_PER_REQUEST);

    const statements = flatten(
        await Promise.all(
            artistIdChunks.map(async (artistIdChunk) =>
                getArtistSnapshots({
                    artistIds: artistIdChunk,
                    timestamp,
                })
            )
        )
    );
    console.log(statements);
};

const readArtistIds = async (): Promise<string[]> => {
    const artistIdsDb = await openDb("artist_ids.db");
    const total = await countRows(artistIdsDb, "artist_ids");
    const chunkSize = Math.floor(total / 24);
    const currentHourIndex = getCurrentHourIndex();
    const limit = chunkSize;
    const offset = chunkSize * currentHourIndex;

    const rows = await artistIdsDb.all<Entity[]>(
        `SELECT id FROM ${ARTIST_IDS_TABLE_NAME} LIMIT ${limit} OFFSET ${offset};`
    );
    const ids = rows.map((row) => row.id);

    return ids;
};

interface GetArtistSnapshotsOptions {
    artistIds: string[];
    attempt?: number;
    timestamp: number;
}

const getArtistSnapshots = async (
    options: GetArtistSnapshotsOptions
): Promise<SQLStatement[]> => {
    const { timestamp, artistIds, attempt = 0 } = options;
    const spotify =
        attempt < 5 ? buildCurrentSpotifyClient() : buildRandomSpotifyClient();
    try {
        const artists = await spotify.artists.get(artistIds);
        return artists.map((artist) => buildInsertStatement(artist, timestamp));
    } catch (error) {
        if (isRateLimitError(error) && attempt < MAX_RETRY_ATTEMPTS) {
            const secondsToSleep = 2 ** attempt;
            await sleep(secondsToSleep * 1000);
            return getArtistSnapshots({
                timestamp,
                artistIds,
                attempt: attempt + 1,
            });
        }

        console.error("Unexpected error retrieving artists", error);
        return [];
    }
};

const buildInsertStatement = (
    artist: Artist,
    timestamp: number
): SQLStatement => {
    const row = [
        artist.id,
        toUnixTimestampInSeconds(timestamp),
        artist.popularity,
        artist.followers.total,
    ];

    return [
        `INSERT OR IGNORE INTO ${ARTIST_SNAPSHOTS_TABLE_NAME} (id, timestamp, popularity, followers) VALUES ($, ?, ?, ?);`,
        row,
    ];
};

export { sync };
