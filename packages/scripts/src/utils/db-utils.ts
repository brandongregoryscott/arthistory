import { Database } from "sqlite";
import sqlite3 from "sqlite3";

const createArtistSnapshotsTable = (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS artist_snapshots (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC,
        UNIQUE (id, timestamp)
    );
 `);

export { createArtistSnapshotsTable };
