const SNAPSHOT_RESOLUTIONS = [
    "daily",
    "monthly",
    "quarterly",
    "weekly",
    "yearly",
] as const;

type SnapshotResolution = (typeof SNAPSHOT_RESOLUTIONS)[number];

const isSnapshotResolution = (value: unknown): value is SnapshotResolution =>
    SNAPSHOT_RESOLUTIONS.some((resolution) => resolution === value);

export { isSnapshotResolution, SNAPSHOT_RESOLUTIONS };
export type { SnapshotResolution };
