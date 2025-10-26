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

/**
 * Returns the hourly sync database name.
 */
const getDbName = (): string => `spotify-data_${getRoundedTimestamp()}.db`;

/**
 * Opens or creates the hourly sync database.
 */
const openOrCreateDb = async () =>
    open({
        filename: getDbName(),
        driver: sqlite3.cached.Database,
    });

export {
    createArtistSnapshotsTable,
    getDbName,
    openOrCreateDb,
    setPerformancePragmas,
};
