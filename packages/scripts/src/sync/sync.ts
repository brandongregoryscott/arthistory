import {
    buildInsertArtistSnapshotStatement,
    countRows,
    createArtistSnapshotsTable,
    flushStatements,
    getSnapshotDbFilename,
    openDb,
    openSnapshotDb,
} from "../utils/db-utils";
import { SpotifyClient } from "../utils/spotify";
import { getCurrentHourIndex } from "../utils/date-utils";
import {
    TableName,
    BULK_INSERTION_CHUNK_SIZE,
    DatabaseName,
} from "../constants/storage";
import type { Entity } from "@repo/common";
import { chunk } from "lodash";
import { createTimerLogger } from "../utils/logger";

interface SyncOptions {
    timestamp: number;
}

const sync = async (options: SyncOptions) => {
    const { timestamp } = options;

    const client = SpotifyClient.buildByCurrentPair();
    const filename = getSnapshotDbFilename(timestamp);
    const db = await openSnapshotDb(timestamp);
    await createArtistSnapshotsTable(db);

    const artistIds = await getArtistIds();
    const artistCount = artistIds.length;

    const stopSnapshotTimer = createTimerLogger(
        { artistCount, filename },
        "Retrieving snapshots for artists"
    );

    const artists = await client.getArtists(artistIds);
    const statements = artists.map((artist) =>
        buildInsertArtistSnapshotStatement({
            id: artist.id,
            followers: artist.followers.total,
            popularity: artist.popularity,
            timestamp,
        })
    );

    stopSnapshotTimer();

    const statementCount = statements.length;
    const stopInsertionTimer = createTimerLogger(
        { statementCount },
        "Inserting snapshots to database"
    );

    const statementChunks = chunk(statements, BULK_INSERTION_CHUNK_SIZE);
    await Promise.all(
        statementChunks.map(async (statementChunk) =>
            flushStatements(db, statementChunk)
        )
    );
    stopInsertionTimer();
};

const getArtistIds = async (): Promise<string[]> => {
    const artistIdsDb = await openDb(DatabaseName.ArtistIds);
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

export { sync };
