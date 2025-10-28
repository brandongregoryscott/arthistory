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

export { BucketName, BULK_INSERTION_CHUNK_SIZE, DatabaseName, TableName };
