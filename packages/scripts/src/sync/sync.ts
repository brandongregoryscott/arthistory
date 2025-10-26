import type { Artist } from "@spotify/web-api-ts-sdk";
import {
    countRows,
    createArtistSnapshotsTable,
    flushStatements,
    openDb,
    openSnapshotDb,
} from "../utils/db-utils";
import {
    buildCurrentSpotifyClient,
    buildRandomSpotifyClient,
    isRateLimitError,
} from "../utils/spotify-utils";
import type { SQLStatement } from "../types";
import { getCurrentHourIndex } from "../utils/date-utils";
import {
    ARTIST_IDS_TABLE_NAME,
    ARTIST_SNAPSHOTS_TABLE_NAME,
    BULK_INSERTION_CHUNK_SIZE,
} from "../constants/storage";
import type { Entity } from "@repo/common";
import { chunk, flatten } from "lodash";
import { sleep } from "../utils/core-utils";

/**
 * The maximum number of artist ids that can be requested at once via the Spotify API.
 */
const MAX_ARTIST_IDS_PER_REQUEST = 50;

/**
 * Maximum number of attempts to retry a request before giving up.
 */
const MAX_RETRY_ATTEMPTS = 10;

interface SyncOptions {
    timestamp: number;
}

const sync = async (options: SyncOptions) => {
    const { timestamp } = options;

    const db = await openSnapshotDb(timestamp);
    await createArtistSnapshotsTable(db);

    const artistIds = await getArtistIds();

    const artistIdChunks = chunk(artistIds, MAX_ARTIST_IDS_PER_REQUEST);

    const statements = flatten(
        await Promise.all(
            artistIdChunks.map(async (artistIdChunk) =>
                getArtistSnapshotStatements({
                    artistIds: artistIdChunk,
                    timestamp,
                })
            )
        )
    );

    const statementChunks = chunk(statements, BULK_INSERTION_CHUNK_SIZE);
    await Promise.all(
        statementChunks.map(async (statementChunk) =>
            flushStatements(db, statementChunk)
        )
    );
};

const getArtistIds = async (): Promise<string[]> => {
    const artistIdsDb = await openDb("artist_ids.db");
    const total = await countRows(artistIdsDb, ARTIST_IDS_TABLE_NAME);
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

interface GetArtistSnapshotStatementsOptions {
    artistIds: string[];
    attempt?: number;
    timestamp: number;
}

const getArtistSnapshotStatements = async (
    options: GetArtistSnapshotStatementsOptions
): Promise<SQLStatement[]> => {
    const { timestamp, artistIds, attempt = 0 } = options;
    const spotify =
        attempt < 5 ? buildCurrentSpotifyClient() : buildRandomSpotifyClient();
    try {
        const artists = await spotify.artists.get(artistIds);
        return artists.map((artist) => buildInsertStatement(artist, timestamp));
    } catch (error) {
        if (isRateLimitError(error) && attempt < MAX_RETRY_ATTEMPTS) {
            const secondsToSleep = Math.pow(2, attempt);
            await sleep(secondsToSleep * 1000);
            return getArtistSnapshotStatements({
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
    const { id, popularity } = artist;
    const followers = artist.followers.total;

    return `
        INSERT OR IGNORE INTO ${ARTIST_SNAPSHOTS_TABLE_NAME}
            (id, timestamp, popularity, followers)
        VALUES
            ('${id}', ${timestamp}, ${popularity}, ${followers});`;
};

export { sync };
