import { existsSync } from "node:fs";
import { copyFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseName } from "../constants/storage";
import {
    createArtistSnapshotsIndexes,
    createArtistSnapshotsTable,
    findCheckpointDbFilename,
    openDb,
} from "../utils/db-utils";
import { getDbFilenames } from "../utils/fs-utils";
import { logger } from "../utils/logger";

type MergeDbsOptions = {
    checkpoint?: string;
    filename?: string;
    skipCheckpointAsBase: boolean;
    skipIndexes: boolean;
    sources?: string[];
};

const mergeDbs = async (options: MergeDbsOptions): Promise<string> => {
    const {
        filename = DatabaseName.Merged,
        skipCheckpointAsBase,
        skipIndexes,
    } = options;
    const sources = options.sources ?? (await getDbFilenames());
    if (sources.some((source) => resolve(source) === resolve(filename))) {
        throw new Error("Merge output cannot also be an input database");
    }
    for (const source of sources) {
        if (!existsSync(source)) {
            throw new Error(`Missing merge source: ${source}`);
        }
    }
    const checkpoint = skipCheckpointAsBase
        ? undefined
        : (options.checkpoint ?? (await findCheckpointDbFilename()));
    const base =
        checkpoint !== undefined && sources.includes(checkpoint)
            ? checkpoint
            : undefined;
    const temporary = `${filename}.building`;
    await rm(temporary, { force: true });
    if (base !== undefined) {
        await copyFile(base, temporary);
    }
    const db = await openDb(temporary);
    try {
        await createArtistSnapshotsTable(db);
        // Non-unique for compatibility with historical checkpoints containing duplicates.
        // New inserts explicitly exclude existing (id, timestamp) observations.
        await db.exec(
            "CREATE INDEX IF NOT EXISTS artist_snapshots_identity ON artist_snapshots (id, timestamp)"
        );
        for (const source of sources.filter((file) => file !== base)) {
            logger.info({ filename, source }, "Merging partial database");
            await db.run("ATTACH DATABASE ? AS source", resolve(source));
            try {
                const columns = await db.all<Array<{ name: string }>>(
                    "PRAGMA source.table_info(artist_snapshots)"
                );
                const listeners = columns.some(
                    (column) => column.name === "monthly_listeners"
                )
                    ? "s.monthly_listeners"
                    : "NULL";
                // Historical imports used milliseconds; preserve existing second-based history.
                const timestamp =
                    "CASE WHEN s.timestamp >= 1000000000000 THEN ROUND(s.timestamp / 1000.0) ELSE s.timestamp END";
                await db.exec("BEGIN IMMEDIATE");
                try {
                    await db.exec(`INSERT OR IGNORE INTO artist_snapshots (id, timestamp, followers, popularity, monthly_listeners)
                        SELECT DISTINCT s.id, ${timestamp}, s.followers, s.popularity, ${listeners}
                        FROM source.artist_snapshots s
                        WHERE NOT EXISTS (SELECT 1 FROM artist_snapshots t WHERE t.id = s.id AND t.timestamp = ${timestamp})`);
                    await db.exec("COMMIT");
                } catch (error) {
                    await db.exec("ROLLBACK");
                    throw error;
                }
            } finally {
                await db.exec("DETACH DATABASE source");
            }
        }
        if (!skipIndexes) {
            await createArtistSnapshotsIndexes(db);
        }
        const result = await db.get<{ quick_check: string }>(
            "PRAGMA quick_check"
        );
        if (result?.quick_check !== "ok") {
            throw new Error("Merged database failed integrity validation");
        }
    } finally {
        await db.close();
    }
    await rename(temporary, filename);
    return filename;
};

export type { MergeDbsOptions };
export { mergeDbs };
