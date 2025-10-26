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
    getRoundedTimestamp,
    toUnixTimestampInSeconds,
} from "../utils/date-utils";
import { ARTIST_SNAPSHOTS_TABLE_NAME } from "../constants/storage";

const sync = async () => {
    const timestamp = getRoundedTimestamp();

    const spotify = buildCurrentSpotifyClient();
    const db = await openSnapshotDb();
    await createArtistSnapshotsTable(db);

    const artists = await spotify.artists.get([
        ARTIST_ID_ALEX_G,
        ARTIST_ID_DUSTER,
    ]);
};

// def read_artist_ids
//   @artist_ids_db.results_as_hash = false
//   total = @artist_ids_db.get_first_value('SELECT COUNT(id) FROM artist_ids;')
//   @artist_ids_db.results_as_hash = true
//   chunk_size = (total / 24).floor
//   puts "db_name #{db_name} timestamp #{@timestamp} artist_ids total #{total} chunk_size #{chunk_size}"
//   limit = chunk_size
//   offset = chunk_size * current_hour_index
//   artist_id_rows = @artist_ids_db.execute('SELECT id FROM artist_ids LIMIT ? OFFSET ?;', [limit, offset])
//   artist_id_rows.map { |row| row['id'] }
// end
const readArtistIds = async (): Promise<string[]> => {
    const artistIdsDb = await openDb("artist_ids.db");
    const total = await countRows(artistIdsDb, "artist_ids");
    return [];
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
        `INSERT OR IGNORE INTO ${ARTIST_SNAPSHOTS_TABLE_NAME} (id, timestamp, popularity, followers) VALUES (?, ?, ?, ?);`,
        row,
    ];
};

export { sync };
