import type { Artist } from "@spotify/web-api-ts-sdk";
import {
    countRows,
    createArtistSnapshotsTable,
    flushStatements,
    getSnapshotDbFilename,
    openDb,
    openSnapshotDb,
} from "../utils/db-utils";
import { SpotifyClient } from "../utils/spotify";
import type { SQLStatement } from "../types";
import { getCurrentHourIndex } from "../utils/date-utils";
import { TableName, BULK_INSERTION_CHUNK_SIZE } from "../constants/storage";
import type { Entity } from "@repo/common";
import { chunk, flatten } from "lodash";

/**
 * The maximum number of artist ids that can be requested at once via the Spotify API.
 */
const MAX_ARTIST_IDS_PER_REQUEST = 50;

interface SyncOptions {
    timestamp: number;
}

const sync = async (options: SyncOptions) => {
    const { timestamp } = options;

    const filename = getSnapshotDbFilename(timestamp);
    const db = await openSnapshotDb(timestamp);
    await createArtistSnapshotsTable(db);

    const artistIds = await getArtistIds();

    console.log(`Retrieving snapshots for ${artistIds.length} artists...`);
    const snapshotLabel = `Retrieved snapshots for ${artistIds.length} artists`;
    console.time(snapshotLabel);

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
    console.timeEnd(snapshotLabel);

    console.log(`Inserting ${statements.length} snapshots to ${filename}...`);
    const insertLabel = `Inserted ${statements.length} snapshots to ${filename}`;
    console.time(insertLabel);

    const statementChunks = chunk(statements, BULK_INSERTION_CHUNK_SIZE);
    await Promise.all(
        statementChunks.map(async (statementChunk) =>
            flushStatements(db, statementChunk)
        )
    );
    console.timeEnd(insertLabel);
};

const getArtistIds = async (): Promise<string[]> => {
    const artistIdsDb = await openDb("artist_ids.db");
    const total = await countRows(artistIdsDb, TableName.ArtistIds);
    const chunkSize = Math.floor(total / 24);
    const currentHourIndex = getCurrentHourIndex();
    const limit = chunkSize;
    const offset = chunkSize * currentHourIndex;

    const rows = await artistIdsDb.all<Entity[]>(
        `SELECT id FROM ${TableName.ArtistIds} LIMIT ${limit} OFFSET ${offset};`
    );
    const ids = rows.map((row) => row.id);

    return ids;
};

interface GetArtistSnapshotStatementsOptions {
    artistIds: string[];
    timestamp: number;
}

const getArtistSnapshotStatements = async (
    options: GetArtistSnapshotStatementsOptions
): Promise<SQLStatement[]> => {
    const { timestamp, artistIds } = options;
    const client = SpotifyClient.buildByCurrentPair();
    const artists = await client.getArtists(artistIds);
    return artists.map((artist) => buildInsertStatement(artist, timestamp));
};

const buildInsertStatement = (
    artist: Artist,
    timestamp: number
): SQLStatement => {
    const { id, popularity } = artist;
    const followers = artist.followers.total;

    return `
        INSERT OR IGNORE INTO ${TableName.ArtistSnapshots}
            (id, timestamp, popularity, followers)
        VALUES
            ('${id}', ${timestamp}, ${popularity}, ${followers});`;
};

export { sync };
