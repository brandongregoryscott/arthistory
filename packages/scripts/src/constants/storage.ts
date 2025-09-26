const CHECKPOINT_DB_NAME = "spotify-data_1751481126928.db";

const MERGED_DB_NAME = "merged-spotify-data.db";

const S3_BUCKET_NAME = "spotify-data";

const PARTIAL_DB_PREFIX = "spotify-data_";

const PARTIAL_DB_PATTERN = `${PARTIAL_DB_PREFIX}*.db`;

export {
    S3_BUCKET_NAME,
    MERGED_DB_NAME,
    CHECKPOINT_DB_NAME,
    PARTIAL_DB_PATTERN,
    PARTIAL_DB_PREFIX,
};
