import { isObjectLike, isString } from "lodash";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type LegacySource = {
    filename: string;
    timestampUnit: "milliseconds" | "seconds";
};

type SourceCounts = {
    artists: number;
    firstTimestamp: null | number;
    lastTimestamp: null | number;
    rows: number;
};

const validateSource = (input: unknown): LegacySource => {
    if (!isObjectLike(input)) {
        throw new Error("Invalid source.");
    }

    const value = input as LegacySource;

    if (
        !isString(value.filename) ||
        !["seconds", "milliseconds"].includes(value.timestampUnit)
    ) {
        throw new Error("Provide a filename and explicit timestamp unit.");
    }

    if (!statSync(value.filename).isFile()) {
        throw new Error("Source must be an existing regular file.");
    }

    return {
        filename: resolve(value.filename),
        timestampUnit: value.timestampUnit,
    };
};

const openLegacySource = (source: LegacySource) => {
    const db = new DatabaseSync(source.filename, { readOnly: true });

    try {
        db.exec(
            "PRAGMA query_only=ON; PRAGMA temp_store=FILE; PRAGMA cache_size=-32768; PRAGMA temp.cache_size=-8192; BEGIN"
        );

        for (const result of db.prepare("PRAGMA integrity_check").iterate()) {
            if (result.integrity_check !== "ok") {
                throw new Error("Source integrity check failed.");
            }
        }

        const columns = db.prepare("PRAGMA table_info(artist_snapshots)").all();

        for (const name of ["id", "timestamp", "followers", "popularity"]) {
            if (!columns.some((column) => column.name === name)) {
                throw new Error(`Source lacks artist_snapshots.${name}.`);
            }
        }

        const counts = db
            .prepare(
                `SELECT COUNT(*) AS rows, COUNT(DISTINCT id) AS artists,
            MIN(timestamp) AS firstTimestamp, MAX(timestamp) AS lastTimestamp
            FROM artist_snapshots`
            )
            .get() as SourceCounts;

        const inventory = {
            ...source,
            ...counts,
            bytes: statSync(source.filename).size,
            integrity: "ok",
        };

        const multiplier = source.timestampUnit === "seconds" ? 1000 : 1;

        // Disk-backed SQLite sorting/window storage bounds JS memory even when
        // the backup has no usable index. No indexes are added.
        const rows = db.prepare(`WITH raw AS (
                SELECT id, timestamp, followers, popularity, rowid AS sourceRow,
                    timestamp * ${multiplier} AS captured FROM artist_snapshots
            ), ranked AS (
                SELECT *, FIRST_VALUE(followers) OVER (
                    PARTITION BY id ORDER BY followers IS NULL, captured DESC, sourceRow DESC
                ) AS latestFollowers FROM raw
            )
            SELECT * FROM ranked ORDER BY id, captured DESC, sourceRow DESC`);

        return { db, inventory, rows };
    } catch (error) {
        db.close();

        throw error;
    }
};

export { openLegacySource, validateSource };
export type { LegacySource };
