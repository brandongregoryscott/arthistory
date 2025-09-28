const MERGED_DB_NAME = "merged-spotify-data.db";

const BUCKET_NAME = "spotify-data";

const PARTIAL_DB_PREFIX = "spotify-data_";

const PARTIAL_DB_PATTERN = `${PARTIAL_DB_PREFIX}*.db`;

const TABLE_NAME = "artist_snapshots";

const TABLE_WITH_CONSTRAINT_NAME = `${TABLE_NAME}_with_constraint`;

export {
    BUCKET_NAME,
    MERGED_DB_NAME,
    PARTIAL_DB_PATTERN,
    PARTIAL_DB_PREFIX,
    TABLE_NAME,
    TABLE_WITH_CONSTRAINT_NAME,
};
