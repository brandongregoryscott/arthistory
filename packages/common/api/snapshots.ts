import type { SnapshotResolution } from "./snapshot-resolution.js";
import type { ArtistSnapshot } from "./types/index.js";

const MAX_CHART_MONTHS = 100 * 12;

const bucketSnapshots = (
    snapshots: ArtistSnapshot[],
    resolution: SnapshotResolution
) => {
    const selected = new Map<string, ArtistSnapshot>();

    for (const snapshot of snapshots) {
        const timestamp = snapshotBucket(snapshot.timestamp, resolution);
        const key = `${snapshot.id}:${timestamp}`;
        const previous = selected.get(key);

        if (
            previous == null ||
            Date.parse(snapshot.capturedAt ?? snapshot.timestamp) >=
                Date.parse(previous.capturedAt ?? previous.timestamp)
        ) {
            selected.set(key, { ...snapshot, timestamp });
        }
    }

    return [...selected.values()].sort((a, b) => {
        const timestamp = a.timestamp.localeCompare(b.timestamp);

        return timestamp !== 0 ? timestamp : a.id.localeCompare(b.id);
    });
};

const alignMonthlyFollowers = (snapshots: ArtistSnapshot[], ids: string[]) => {
    const rows = bucketSnapshots(
        snapshots.filter((snapshot) => ids.includes(snapshot.id)),
        "monthly"
    );
    const timestamps: string[] = [];
    const first = rows[0]?.timestamp;
    const last = rows.at(-1)?.timestamp;

    if (first != null && last != null) {
        const date = new Date(first);

        while (date.toISOString() <= last) {
            // Bound chart allocations even if stored dates are corrupt.
            if (timestamps.length >= MAX_CHART_MONTHS) {
                throw new Error("Snapshot chart exceeds 100 years.");
            }

            timestamps.push(date.toISOString());
            date.setUTCMonth(date.getUTCMonth() + 1);
        }
    }

    const followers = new Map(
        rows.map((row) => [`${row.id}:${row.timestamp}`, row.followers])
    );
    const values = Object.fromEntries(
        ids.map((id) => [
            id,
            timestamps.map(
                (timestamp) => followers.get(`${id}:${timestamp}`) ?? null
            ),
        ])
    );

    return { timestamps, values };
};

const snapshotBucket = (timestamp: string, resolution: SnapshotResolution) => {
    const date = new Date(timestamp);

    date.setUTCHours(0, 0, 0, 0);

    if (resolution === "weekly") {
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    } else if (resolution !== "daily") {
        date.setUTCDate(1);

        if (resolution === "quarterly") {
            date.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3);
        } else if (resolution === "yearly") {
            date.setUTCMonth(0);
        }
    }

    return date.toISOString();
};

export { alignMonthlyFollowers, bucketSnapshots, snapshotBucket };
