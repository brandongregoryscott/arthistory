import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { isEmpty } from "lodash";
import type { Database, SQLStatement } from "../types";
import { DatabaseName, TableName } from "../constants/storage";
import { createTimerLogger } from "./logger";

const createArtistSnapshotsTable = (db: Database) =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS ${TableName.ArtistSnapshots} (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC
    );
 `);

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

type GetMergedSnapshotDbFilenameOptions =
    | {
          end: number;
          start: number;
          useRangeFilename: true;
      }
    | {
          useRangeFilename: false;
      };

const getMergedSnapshotDbFilename = (
    options: GetMergedSnapshotDbFilenameOptions
): string => {
    const { useRangeFilename } = options;
    if (useRangeFilename) {
        const { start, end } = options;
        return DatabaseName.Merged.replace(".db", `_${start}-${end}.db`);
    }

    return DatabaseName.Merged;
};

const openDb = async (fileName: string): Promise<Database> =>
    open({
        filename: fileName,
        driver: sqlite3.cached.Database,
    });

const openSnapshotDb = async (timestamp: number) =>
    openDb(getSnapshotDbFilename(timestamp));

export {
    countRows,
    createArtistSnapshotsTable,
    flushStatements,
    flushStatementsIfNeeded,
    getMergedSnapshotDbFilename,
    getSnapshotDbFilename,
    openDb,
    openSnapshotDb,
    paginateRows,
    setPerformancePragmas,
};
