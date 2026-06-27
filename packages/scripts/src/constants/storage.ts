const BULK_INSERTION_CHUNK_SIZE = 250000;

const DatabaseName = {
    ArtistIds: "artist-ids.db",
    Merged: "merged-spotify-data.db",
    PartialSnapshotPattern: "spotify-data_*.db",
    PartialSnapshotPrefix: "spotify-data_",
    Production: "_spotify-data.db",
    Sample: "sample-spotify-data.db",
} as const;

const BucketName = {
    ArtistIds: "artist-ids",
    Logs: "logs",
    SnapshotBackups: "spotify-data-backups",
    Snapshots: "spotify-data",
} as const;

const TableName = {
    ArtistIds: "artist_ids",
    ArtistSnapshots: "artist_snapshots",
    ArtistSnapshotsWithConstraint: "artist_snapshots_with_constraint",
} as const;

export { BucketName, BULK_INSERTION_CHUNK_SIZE, DatabaseName, TableName };
