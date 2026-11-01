import type { ArtistSnapshotRow } from "@repo/common";
import { stat } from "node:fs/promises";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import type { Database, SQLStatement } from "../types";
import { DatabaseName } from "../constants/storage";
import { getDbFilenames } from "./fs-utils";

const createArtistSnapshotsTable = async (db: Database) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS artist_snapshots (
        id TEXT, timestamp NUMERIC, followers NUMERIC, popularity NUMERIC, monthly_listeners NUMERIC
    )`);
    const columns = await db.all<Array<{ name: string }>>(
        "PRAGMA table_info(artist_snapshots)"
    );
    if (!columns.some((column) => column.name === "monthly_listeners")) {
        await db.exec(
            "ALTER TABLE artist_snapshots ADD COLUMN monthly_listeners NUMERIC"
        );
    }
};

const createArtistSnapshotsIndexes = async (db: Database) =>
    db.exec(`
        CREATE INDEX IF NOT EXISTS artist_snapshots_id ON artist_snapshots (id);
        CREATE INDEX IF NOT EXISTS artist_snapshots_timestamp ON artist_snapshots (timestamp);
    `);

const buildInsertArtistSnapshotStatement = (
    row: ArtistSnapshotRow
): SQLStatement => [
    `INSERT OR IGNORE INTO artist_snapshots (id, timestamp, popularity, followers, monthly_listeners)
     SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM artist_snapshots WHERE id = ? AND timestamp = ?)`,
    [
        row.id,
        row.timestamp,
        row.popularity,
        row.followers,
        row.monthly_listeners ?? null,
        row.id,
        row.timestamp,
    ],
];

const countRows = async (db: Database, table: string): Promise<number> => {
    const row = await db.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`
    );
    return row?.count ?? 0;
};

// Await every write so an error rolls back instead of looking like a successful upload.
const flushStatements = async (
    db: Database,
    statements: SQLStatement[]
): Promise<void> => {
    if (statements.length === 0) {
        return;
    }
    await db.exec("BEGIN IMMEDIATE");
    try {
        for (const statement of statements) {
            if (Array.isArray(statement)) {
                await db.run(...statement);
            } else {
                await db.run(statement);
            }
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
};

const paginateRows = async <T>(
    db: Database,
    table: string,
    pageSize: number,
    callback: (rows: T[]) => Promise<void>
): Promise<void> => {
    let offset = 0;
    for (;;) {
        const rows = await db.all<T[]>(
            `SELECT * FROM ${table} ORDER BY rowid LIMIT ? OFFSET ?`,
            pageSize,
            offset
        );
        if (rows.length === 0) {
            return;
        }
        await callback(rows);
        offset += rows.length;
    }
};

const getSnapshotDbFilename = (timestamp: number) =>
    `${DatabaseName.PartialSnapshotPrefix}${timestamp}.db`;

// Compatibility for existing multi-GB checkpoints; new cron checkpoints use an explicit manifest.
const findCheckpointDbFilename = async (): Promise<string | undefined> => {
    const files = await Promise.all(
        (await getDbFilenames()).map(async (fileName) => ({
            fileName,
            size: (await stat(fileName)).size,
        }))
    );
    return files
        .sort((a, b) => b.size - a.size)
        .find((file) => file.size >= 1024 ** 3)?.fileName;
};

const openDb = async (fileName: string): Promise<Database> =>
    open({ driver: sqlite3.Database, filename: fileName });

export {
    buildInsertArtistSnapshotStatement,
    countRows,
    createArtistSnapshotsIndexes,
    createArtistSnapshotsTable,
    findCheckpointDbFilename,
    flushStatements,
    getSnapshotDbFilename,
    openDb,
    paginateRows,
};
