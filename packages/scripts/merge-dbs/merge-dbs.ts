import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { glob, rename } from "fs/promises";
import { existsSync } from "fs";
import { ArtistSnapshotRow } from "@repo/common";
import { chunk, isEmpty } from "lodash";
import {
    CHECKPOINT_DB_NAME,
    MERGED_DB_NAME,
    PARTIAL_DB_PATTERN,
} from "../constants/storage";

const CHUNK_SIZE = 100000;
const USE_CHECKPOINT_DB_AS_BASE_IF_FOUND = true;

type SQLStatement = [sql: string, values: any[]];

const main = async () => {
    // The original database from the git-based tracking is ~6GB, there's no point in wasting time copying rows
    // over to a new, empty database. Just rename it and move on
    const hasCheckpointDb = existsSync(CHECKPOINT_DB_NAME);
    if (hasCheckpointDb && USE_CHECKPOINT_DB_AS_BASE_IF_FOUND) {
        await rename(CHECKPOINT_DB_NAME, MERGED_DB_NAME);
    }

    const targetDb = await openDb(MERGED_DB_NAME);
    await createArtistSnapshotsTable(targetDb);
    await setPerformancePragmas(targetDb);

    const sourceDbFileNames = await getSourceDbFileNames();

    const startLabel = `Merging ${sourceDbFileNames.length} partial databases...`;
    console.log(startLabel);

    const endLabel = `Merged ${sourceDbFileNames.length} partial databases`;
    console.time(endLabel);

    for (const sourceDbFileName of sourceDbFileNames) {
        const index = sourceDbFileNames.indexOf(sourceDbFileName);
        console.log(
            `Merging ${sourceDbFileName} (${index + 1}/${sourceDbFileNames.length})...`
        );
        const sourceDb = await openDb(sourceDbFileName);
        await paginateRows<ArtistSnapshotRow>(
            sourceDb,
            "artist_snapshots",
            CHUNK_SIZE,
            (rows) =>
                bulkExecute(
                    targetDb,
                    rows,
                    generateInsertArtistSnapshotStatements
                )
        );
        await sourceDb.close();
    }

    await createArtistSnapshotsIndexes(targetDb);

    console.timeEnd(endLabel);
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

const createArtistSnapshotsTable = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    CREATE TABLE IF NOT EXISTS artist_snapshots (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC,
        UNIQUE (id, timestamp)
    )`);

const createArtistSnapshotsIndexes = async (
    db: Database<sqlite3.Database, sqlite3.Statement>
) =>
    db.exec(`
    CREATE INDEX artist_snapshot_id ON artist_snapshots (id);
    CREATE INDEX artist_snapshot_timestamp ON artist_snapshots (timestamp);
`);

const bulkExecute = async <T>(
    db: Database<sqlite3.Database, sqlite3.Statement>,
    items: T[],
    generateStatements: (items: T[]) => SQLStatement[],
    chunkSize = CHUNK_SIZE,
    flushAfter = CHUNK_SIZE
): Promise<void> => {
    let statements: SQLStatement[] = [];
    const itemChunks = chunk(items, chunkSize);
    for (const itemChunk of itemChunks) {
        statements = [...statements, ...generateStatements(itemChunk)];
        const flushed = await flushStatementsIfNeeded(
            db,
            statements,
            flushAfter
        );
        if (flushed) {
            statements = [];
        }
    }

    await flushStatements(db, statements);
};

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
        "INSERT OR IGNORE INTO artist_snapshots (id, timestamp, popularity, followers) VALUES (?, ?, ?, ?);",
        values,
    ];
};

const getSourceDbFileNames = async (): Promise<string[]> => {
    const fileNames: string[] = [];
    for await (const fileName of glob(PARTIAL_DB_PATTERN)) {
        fileNames.push(fileName);
    }

    return fileNames;
};

const openDb = async (fileName: string) =>
    open({
        filename: fileName,
        driver: sqlite3.cached.Database,
    });

main();
