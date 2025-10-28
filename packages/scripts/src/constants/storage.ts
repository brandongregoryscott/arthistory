const MERGED_DB_NAME = "merged-spotify-data.db";

const SNAPSHOT_DB_BUCKET_NAME = "spotify-data";

const SNAPSHOT_DB_BACKUP_BUCKET_NAME = "spotify-data-backups";

const PARTIAL_DB_PREFIX = "spotify-data_";

const PARTIAL_DB_PATTERN = `${PARTIAL_DB_PREFIX}*.db`;

const ARTIST_SNAPSHOTS_TABLE_NAME = "artist_snapshots";

const ARTIST_IDS_DB_BUCKET_NAME = "artist-ids";

const ARTIST_IDS_TABLE_NAME = "artist_ids";

const ARTIST_IDS_DB_NAME = "artist_ids.db";

const ARTIST_SNAPSHOTS_TABLE_WITH_CONSTRAINT_NAME = `${ARTIST_SNAPSHOTS_TABLE_NAME}_with_constraint`;

const BULK_INSERTION_CHUNK_SIZE = 250000;

const DatabaseName = {
    ArtistIds: "artist_ids.db",
    Merged: "merged-spotify-data.db",
    PartialSnapshotPrefix: "spotify-data_",
    PartialSnapshotPattern: "spotify-data_*.db",
} as const;

const BucketName = {
    ArtistIds: "artist-ids",
    Snapshots: "spotify-data",
    SnapshotBackups: "spotify-data-backups",
} as const;

const TableName = {
    ArtistSnapshots: "artist_snapshots",
    ArtistSnapshotsWithConstraint: "artist_snapshots_with_constraint",
    ArtistIds: "artist_ids",
} as const;

export {
    ARTIST_IDS_DB_BUCKET_NAME,
    ARTIST_IDS_DB_NAME,
    ARTIST_IDS_TABLE_NAME,
    ARTIST_SNAPSHOTS_TABLE_NAME,
    ARTIST_SNAPSHOTS_TABLE_WITH_CONSTRAINT_NAME,
    BucketName,
    BULK_INSERTION_CHUNK_SIZE,
    DatabaseName,
    MERGED_DB_NAME,
    PARTIAL_DB_PATTERN,
    PARTIAL_DB_PREFIX,
    SNAPSHOT_DB_BACKUP_BUCKET_NAME,
    SNAPSHOT_DB_BUCKET_NAME,
    TableName,
};
