import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { first, isEmpty, sortBy } from "lodash";
import type { Database, SQLStatement } from "../types";
import { TableName } from "../constants/storage";
import { createTimerLogger, logger } from "./logger";
import { getDbFilenames } from "./fs-utils";
import { stat } from "fs/promises";
import type { ArtistSnapshotRow } from "@repo/common";

const createArtistSnapshotsTable = (db: Database) =>
    db.exec(createArtistSnapshotsTableSql());

const createArtistSnapshotsTableSql = (uniqueConstraint: boolean = false) => `
        CREATE TABLE IF NOT EXISTS ${TableName.ArtistSnapshots} (
            id TEXT,
            timestamp NUMERIC,
            followers NUMERIC,
            popularity NUMERIC
            ${uniqueConstraint ? ",UNIQUE (id, timestamp)" : ""}
        );
 `;

const createArtistSnapshotsIndexes = async (db: Database) =>
    db.exec(`
        CREATE INDEX ${TableName.ArtistSnapshots}_id ON ${TableName.ArtistSnapshots} (id);
        CREATE INDEX ${TableName.ArtistSnapshots}_timestamp ON ${TableName.ArtistSnapshots} (timestamp);
`);

const dropArtistSnapshotsConstraintIfExists = async (db: Database) => {
    // Check to see if the table actually has a unique index before doing extra work to transfer records
    // to a new table that definitely does not have the index
    const hasUniqueIndex =
        (await db.get(`PRAGMA index_list(${TableName.ArtistSnapshots});`)) !==
        undefined;

    if (!hasUniqueIndex) {
        logger.info(
            `No unique index found, creating ${TableName.ArtistSnapshots} if it does not exist`
        );
        await createArtistSnapshotsTable(db);
        return;
    }

    const stopUniqueConstraintTimer = createTimerLogger(
        `Creating '${TableName.ArtistSnapshots}' without unique constraint`
    );
    await db.exec(`
        PRAGMA foreign_keys=off;

        ${createArtistSnapshotsTableSql(true)}

        BEGIN TRANSACTION;

        ALTER TABLE ${TableName.ArtistSnapshots} RENAME TO ${TableName.ArtistSnapshotsWithConstraint};

        ${createArtistSnapshotsTableSql()}

        INSERT INTO ${TableName.ArtistSnapshots} SELECT * FROM ${TableName.ArtistSnapshotsWithConstraint};

        COMMIT;

        DROP TABLE IF EXISTS ${TableName.ArtistSnapshotsWithConstraint};
        VACUUM;

        PRAGMA foreign_keys=on;
`);
    stopUniqueConstraintTimer();
};

const buildInsertArtistSnapshotStatement = (
    row: ArtistSnapshotRow
): SQLStatement => {
    const { id, popularity, followers, timestamp } = row;

    return `
        INSERT OR IGNORE INTO ${TableName.ArtistSnapshots}
            (id, timestamp, popularity, followers)
        VALUES
            ('${id}', ${timestamp}, ${popularity}, ${followers});`;
};

/**
 * @see https://stackoverflow.com/a/58547438
 */
const setPerformancePragmas = async (db: Database) =>
    db.exec(`
        PRAGMA synchronous = OFF;
        PRAGMA locking_mode = EXCLUSIVE;
        PRAGMA journal_mode = OFF;
 `);

const countRows = async (db: Database, table: string): Promise<number> => {
    const result = (await db.get(`SELECT COUNT(*) FROM ${table};`)) as {
        "COUNT(*)": number;
    };
    return result["COUNT(*)"];
};

const flushStatementsIfNeeded = async (
    db: Database,
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
    db: Database,
    statements: SQLStatement[]
): Promise<void> =>
    new Promise((resolve) => {
        if (isEmpty(statements)) {
            resolve();
            return;
        }

        const statementCount = statements.length;
        const stopFlushTimer = createTimerLogger(
            { statementCount },
            "Flushing statements"
        );
        const dbInstance = db.getDatabaseInstance();
        dbInstance.serialize(() => {
            dbInstance.run("BEGIN TRANSACTION");
            statements.forEach((statement) => {
                if (Array.isArray(statement)) {
                    dbInstance.run(...statement);
                    return;
                }

                dbInstance.run(statement);
            });
            dbInstance.run("COMMIT", () => {
                stopFlushTimer();
                resolve();
            });
        });
    });

const paginateRows = async <T>(
    db: Database,
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

const getSnapshotDbFilename = (timestamp: number) =>
    `spotify-data_${timestamp}.db`;

const findCheckpointDbFilename = async (): Promise<string | undefined> => {
    const dbFileNames = await getDbFilenames();
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

const openDb = async (fileName: string): Promise<Database> =>
    open({
        filename: fileName,
        driver: sqlite3.cached.Database,
    });

const openSnapshotDb = async (timestamp: number) =>
    openDb(getSnapshotDbFilename(timestamp));

export {
    buildInsertArtistSnapshotStatement,
    countRows,
    createArtistSnapshotsIndexes,
    createArtistSnapshotsTable,
    dropArtistSnapshotsConstraintIfExists,
    findCheckpointDbFilename,
    flushStatements,
    flushStatementsIfNeeded,
    getSnapshotDbFilename,
    openDb,
    openSnapshotDb,
    paginateRows,
    setPerformancePragmas,
};
