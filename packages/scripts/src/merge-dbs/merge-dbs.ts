import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { copyFile, stat } from "fs/promises";
import { ArtistSnapshotRow } from "@repo/common";
import { compact, first, isEmpty, last, sortBy } from "lodash";
import {
    MERGED_DB_NAME,
    TABLE_NAME,
    TABLE_WITH_CONSTRAINT_NAME,
} from "../constants/storage";
import { getDbFileNames, parseTimestamp } from "../utils/fs-utils";
import { program } from "commander";

const CHUNK_SIZE = 100000;
const FLUSH_AFTER = 250000;

interface Options {
    skipCheckpointAsBase: boolean;
    skipIndexes: boolean;
    useRangeFilename: boolean;
}

type SQLStatement = [sql: string, values: any[]];

program.option(
    "--skip-checkpoint-as-base",
    "Skip using the largest partial database as the base to merge onto",
    false
);
program.option(
    "--skip-indexes",
    "Skip creating indexes after merging partial databases",
    false
);
program.option(
    "--use-range-filename",
    `Set the name of the merged file to the start and end timestamps instead of '${MERGED_DB_NAME}'`,
    false
);

program.parse();
const { skipCheckpointAsBase, skipIndexes, useRangeFilename } =
    program.opts<Options>();

const main = async () => {
    let mergedDbName = MERGED_DB_NAME;
    let sourceDbFileNames = await getDbFileNames();

    if (useRangeFilename) {
        const timestamps = sortBy(
            compact(sourceDbFileNames.map(parseTimestamp))
        ).reverse();

        const start = first(timestamps);
        const end = last(timestamps);
        if (start !== undefined && end !== undefined) {
            mergedDbName = MERGED_DB_NAME.replace(".db", `_${start}-${end}.db`);
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
    await createArtistSnapshotsTableWithoutConstraint(targetDb);
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
            TABLE_NAME,
            CHUNK_SIZE,
            async (rows) => {
                statements = [
                    ...statements,
                    ...generateInsertArtistSnapshotStatements(rows),
                ];
                const flushed = await flushStatementsIfNeeded(
                    targetDb,
                    statements,
                    FLUSH_AFTER
                );
                if (flushed) {
                    console.log(`Flushed at ${statements.length} statements`);
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

const countRows = async (
    db: Database<sqlite3.Database, sqlite3.Statement>,
    table: string
): Promise<number> => {
    const result = (await db.get(`SELECT COUNT(*) FROM ${table};`)) as {
        "COUNT(*)": number;
    };
    return result["COUNT(*)"];
};

const paginateRows = async <T>(
    db: Database<sqlite3.Database, sqlite3.Statement>,
    table: string,
    pageSize: number,
    callback: (rows: T[]) => Promise<void>
): Promise<void> => {
    const total = await countRows(db, table);
    let counter = 0;
    while (counter < total) {
        const rows = await db.all<T[]>(
            `SELECT * FROM ${table} LIMIT ${pageSize} OFFSET ${counter};`
        );
        counter += rows.length;
        await callback(rows);
    }
};

/**
 * @see https://stackoverflow.com/a/58547438
 */
const setPerformancePragmas = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    PRAGMA synchronous = OFF;
    PRAGMA locking_mode = EXCLUSIVE;
    PRAGMA journal_mode = OFF;
`);

const createArtistSnapshotsTableWithoutConstraint = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) => {
    const label = `Created '${TABLE_NAME}'`;
    console.log(`Creating '${TABLE_NAME}' without unique constraint...`);
    console.time(label);
    await db.exec(`
    PRAGMA foreign_keys=off;

    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC,
        UNIQUE (id, timestamp)
    );

    BEGIN TRANSACTION;

    ALTER TABLE ${TABLE_NAME} RENAME TO ${TABLE_WITH_CONSTRAINT_NAME};

    CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC
    );

    INSERT INTO ${TABLE_NAME} SELECT * FROM ${TABLE_WITH_CONSTRAINT_NAME};

    COMMIT;

    DROP TABLE IF EXISTS ${TABLE_WITH_CONSTRAINT_NAME};
    VACUUM;

    PRAGMA foreign_keys=on;
    `);
    console.timeEnd(label);
};

const createArtistSnapshotsIndexes = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    CREATE INDEX artist_snapshot_id ON ${TABLE_NAME} (id);
    CREATE INDEX artist_snapshot_timestamp ON ${TABLE_NAME} (timestamp);
`);

const flushStatementsIfNeeded = async (
    db: Database<sqlite3.Database, sqlite3.Statement>,
    statements: SQLStatement[],
    flushAfter: number
): Promise<boolean> => {
    if (statements.length < flushAfter) {
        return false;
    }

    await flushStatements(db, statements);
    return true;
};

const flushStatements = async (
    db: Database<sqlite3.Database, sqlite3.Statement>,
    statements: SQLStatement[]
): Promise<void> =>
    new Promise((resolve) => {
        if (isEmpty(statements)) {
            resolve();
            return;
        }

        const _db = db.getDatabaseInstance();
        _db.serialize(() => {
            _db.run("BEGIN TRANSACTION");
            statements.forEach((statement) => {
                _db.run(...statement);
            });
            _db.run("COMMIT", resolve);
        });
    });

const generateInsertArtistSnapshotStatements = (
    snapshots: ArtistSnapshotRow[]
): SQLStatement[] => snapshots.map(generateInsertArtistSnapshotStatement);

const generateInsertArtistSnapshotStatement = (
    snapshot: ArtistSnapshotRow
): SQLStatement => {
    const values = [
        snapshot.id,
        snapshot.timestamp,
        snapshot.popularity,
        snapshot.followers,
    ];

    return [
        `INSERT OR IGNORE INTO ${TABLE_NAME} (id, timestamp, popularity, followers) VALUES (?, ?, ?, ?);`,
        values,
    ];
};

const openDb = async (fileName: string) =>
    open({
        filename: fileName,
        driver: sqlite3.cached.Database,
    });

main();
