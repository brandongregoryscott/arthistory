import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import { getRoundedTimestamp } from "./date-utils";

const createArtistSnapshotsTable = (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS artist_snapshots (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC
    );
 `);

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

const countRows = async (
    db: Database<sqlite3.Database, sqlite3.Statement>,
    table: string
): Promise<number> => {
    const result = (await db.get(`SELECT COUNT(*) FROM ${table};`)) as {
        "COUNT(*)": number;
    };
    return result["COUNT(*)"];
};

/**
 * Returns the hourly sync database name.
 */
const getDbName = (): string => `spotify-data_${getRoundedTimestamp()}.db`;

const openDb = async (fileName: string) =>
    open({
        filename: fileName,
        driver: sqlite3.cached.Database,
    });

const openSnapshotDb = async () => openDb(getDbName());

export {
    createArtistSnapshotsTable,
    countRows,
    getDbName,
    openDb,
    openSnapshotDb,
    setPerformancePragmas,
};
