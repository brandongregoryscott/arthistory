import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { getRoundedTimestamp } from "./date-utils";
import { isEmpty } from "lodash";
import type { Database, SQLStatement } from "../types";
import { ARTIST_SNAPSHOTS_TABLE_NAME } from "../constants/storage";

const createArtistSnapshotsTable = (db: Database) =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS ${ARTIST_SNAPSHOTS_TABLE_NAME} (
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

        console.log(`Flushing ${statements.length} statements...`);
        const label = `Flushed ${statements.length} statements`;
        console.time(label);
        const _db = db.getDatabaseInstance();
        _db.serialize(() => {
            _db.run("BEGIN TRANSACTION");
            statements.forEach((statement) => {
                _db.run(...statement);
            });
            _db.run("COMMIT", () => {
                console.timeEnd(label);
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

/**
 * Returns the hourly sync database name.
 */
const getDbName = (): string => `spotify-data_${getRoundedTimestamp()}.db`;

const openDb = async (fileName: string): Promise<Database> =>
    open({
        filename: fileName,
        driver: sqlite3.cached.Database,
    });

const openSnapshotDb = async () => openDb(getDbName());

export {
    countRows,
    createArtistSnapshotsTable,
    flushStatements,
    flushStatementsIfNeeded,
    getDbName,
    openDb,
    openSnapshotDb,
    paginateRows,
    setPerformancePragmas,
};
