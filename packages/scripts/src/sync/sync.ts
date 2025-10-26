import type { Artist } from "@spotify/web-api-ts-sdk";
import { ARTIST_ID_ALEX_G, ARTIST_ID_DUSTER } from "../constants/spotify";
import {
    countRows,
    createArtistSnapshotsTable,
    openDb,
    openSnapshotDb,
} from "../utils/db-utils";
import { buildCurrentSpotifyClient } from "../utils/spotify-utils";
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

const sync = async () => {
    const timestamp = getRoundedTimestamp();

    const spotify = buildCurrentSpotifyClient();
    const db = await openSnapshotDb();
    await createArtistSnapshotsTable(db);

    const artistIds = await readArtistIds();
    const artists = await spotify.artists.get([
        ARTIST_ID_ALEX_G,
        ARTIST_ID_DUSTER,
    ]);
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
