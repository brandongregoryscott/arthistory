import type sqlite3 from "sqlite3";
import type { Database } from "sqlite";
import { copyFile, stat } from "fs/promises";
import type { ArtistSnapshotRow } from "@repo/common";
import { compact, first, last, sortBy } from "lodash";
import {
    MERGED_DB_NAME,
    ARTIST_SNAPSHOTS_TABLE_NAME,
    ARTIST_SNAPSHOTS_TABLE_WITH_CONSTRAINT_NAME,
    BULK_INSERTION_CHUNK_SIZE,
} from "../constants/storage";
import { getDbFileNames, parseTimestamp } from "../utils/fs-utils";
import { program } from "commander";
import {
    countRows,
    createArtistSnapshotsTable,
    flushStatements,
    flushStatementsIfNeeded,
    getMergedSnapshotDbFilename,
    openDb,
    paginateRows,
    setPerformancePragmas,
} from "../utils/db-utils";
import { toUnixTimestampInSeconds } from "../utils/date-utils";
import type { SQLStatement } from "../types";

const CHUNK_SIZE = 100000;

interface MergeDbsOptions {
    skipCheckpointAsBase: boolean;
    skipIndexes: boolean;
    useRangeFilename: boolean;
}

const mergeDbs = async (options: MergeDbsOptions): Promise<string> => {
    const { skipCheckpointAsBase, skipIndexes, useRangeFilename } = options;
    let mergedDbName = MERGED_DB_NAME;
    let sourceDbFileNames = await getDbFileNames();

    if (useRangeFilename) {
        const timestamps = sortBy(
            compact(sourceDbFileNames.map(parseTimestamp))
        ).reverse();

        const start = first(timestamps);
        const end = last(timestamps);
        if (start !== undefined && end !== undefined) {
            mergedDbName = getMergedSnapshotDbFilename({
                start,
                end,
                useRangeFilename,
            });
        }
    }

    // The original database from the git-based tracking is ~6GB, there's no point in wasting time copying rows
    // over to a new, empty database. Just copy it with a new filename and move on
    const checkpointDb = await findCheckpointDb();
    if (checkpointDb !== undefined && !skipCheckpointAsBase) {
        console.log(
            `Found checkpoint db '${checkpointDb}', copying to '${mergedDbName}' to use as base...`
        );
        await copyFile(checkpointDb, mergedDbName);

        // Filter out the checkpoint db so we don't try to merge it into the copied base
        sourceDbFileNames = sourceDbFileNames.filter(
            (sourceDbFileName) => sourceDbFileName !== checkpointDb
        );
    }

    const targetDb = await openDb(mergedDbName);
    await maybeDropArtistSnapshotsConstraint(targetDb);
    await setPerformancePragmas(targetDb);

    const startLabel = `Merging ${sourceDbFileNames.length} partial databases...`;
    console.log(startLabel);

    const endLabel = `Merged ${sourceDbFileNames.length} partial databases`;
    console.time(endLabel);

    let statements: SQLStatement[] = [];
    for (const sourceDbFileName of sourceDbFileNames) {
        const index = sourceDbFileNames.indexOf(sourceDbFileName);
        console.log(
            `Reading rows from ${sourceDbFileName} (${index + 1}/${sourceDbFileNames.length})...`
        );
        const sourceDb = await openDb(sourceDbFileName);
        await paginateRows<ArtistSnapshotRow>(
            sourceDb,
            ARTIST_SNAPSHOTS_TABLE_NAME,
            CHUNK_SIZE,
            async (rows) => {
                statements = [
                    ...statements,
                    ...generateInsertArtistSnapshotStatements(rows),
                ];
                const flushed = await flushStatementsIfNeeded(
                    targetDb,
                    statements,
                    BULK_INSERTION_CHUNK_SIZE
                );
                if (flushed) {
                    statements = [];
                }
            }
        );

        await sourceDb.close();
    }

    await flushStatements(targetDb, statements);
    statements = [];

    if (!skipIndexes) {
        console.log("Creating indexes...");
        const createdIndexLabel = "Created indexes";
        console.time(createdIndexLabel);
        await createArtistSnapshotsIndexes(targetDb);
        console.timeEnd(createdIndexLabel);
    }

    console.timeEnd(endLabel);

    return mergedDbName;
};

const findCheckpointDb = async (): Promise<string | undefined> => {
    const dbFileNames = await getDbFileNames();
    const dbFileSizes = await Promise.all(
        dbFileNames.map(async (fileName) => {
            const { size } = await stat(fileName);
            return { fileName, size };
        })
    );
    const dbFilesBySize = sortBy(dbFileSizes, ({ size }) => size).reverse();
    const largestDb = first(dbFilesBySize);
    // The checkpoint db should very likely be several GB at this point of tracking, so throw out anything smaller
    if (largestDb !== undefined && largestDb.size >= Math.pow(1024, 3)) {
        return largestDb.fileName;
    }

    return undefined;
};

const maybeDropArtistSnapshotsConstraint = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) => {
    // Check to see if the table actually has a unique index before doing extra work to transfer records
    // to a new table that definitely does not have the index
    const hasUniqueIndex =
        (await db.get(`PRAGMA index_list(${ARTIST_SNAPSHOTS_TABLE_NAME});`)) !==
        undefined;

    if (!hasUniqueIndex) {
        console.log(
            `No unique index found, creating ${ARTIST_SNAPSHOTS_TABLE_NAME} if it does not exist...`
        );
        await createArtistSnapshotsTable(db);
        return;
    }

    const label = `Created '${ARTIST_SNAPSHOTS_TABLE_NAME}'`;
    console.log(
        `Creating '${ARTIST_SNAPSHOTS_TABLE_NAME}' without unique constraint...`
    );
    console.time(label);
    await db.exec(`
    PRAGMA foreign_keys=off;

    CREATE TABLE IF NOT EXISTS ${ARTIST_SNAPSHOTS_TABLE_NAME} (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC,
        UNIQUE (id, timestamp)
    );

    BEGIN TRANSACTION;

    ALTER TABLE ${ARTIST_SNAPSHOTS_TABLE_NAME} RENAME TO ${ARTIST_SNAPSHOTS_TABLE_WITH_CONSTRAINT_NAME};

    CREATE TABLE IF NOT EXISTS ${ARTIST_SNAPSHOTS_TABLE_NAME} (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC
    );

    INSERT INTO ${ARTIST_SNAPSHOTS_TABLE_NAME} SELECT * FROM ${ARTIST_SNAPSHOTS_TABLE_WITH_CONSTRAINT_NAME};

    COMMIT;

    DROP TABLE IF EXISTS ${ARTIST_SNAPSHOTS_TABLE_WITH_CONSTRAINT_NAME};
    VACUUM;

    PRAGMA foreign_keys=on;`);
    console.timeEnd(label);
};

const createArtistSnapshotsIndexes = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    CREATE INDEX ${ARTIST_SNAPSHOTS_TABLE_NAME}_id ON ${ARTIST_SNAPSHOTS_TABLE_NAME} (id);
    CREATE INDEX ${ARTIST_SNAPSHOTS_TABLE_NAME}_timestamp ON ${ARTIST_SNAPSHOTS_TABLE_NAME} (timestamp);
`);

const generateInsertArtistSnapshotStatements = (
    snapshots: ArtistSnapshotRow[]
): SQLStatement[] => snapshots.map(generateInsertArtistSnapshotStatement);

const generateInsertArtistSnapshotStatement = (
    snapshot: ArtistSnapshotRow
): SQLStatement => {
    const timestampInSeconds = toUnixTimestampInSeconds(snapshot.timestamp);

    const values = [
        snapshot.id,
        timestampInSeconds,
        snapshot.popularity,
        snapshot.followers,
    ];

    return [
        `INSERT OR IGNORE INTO ${ARTIST_SNAPSHOTS_TABLE_NAME} (id, timestamp, popularity, followers) VALUES (?, ?, ?, ?);`,
        values,
    ];
};

export type { MergeDbsOptions };
export { mergeDbs };
