import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";
import { glob } from "fs/promises";
import { ArtistSnapshotRow } from "@repo/common";
import { chunk, isEmpty } from "lodash";
import { PARTIAL_DB_PATTERN } from "../constants/storage";

const CHUNK_SIZE = 50000;
const MERGED_DB_NAME = "merged-spotify-data.db";

type SQLStatement = [sql: string, values: any[]];

const main = async () => {
    const targetDb = await openDb(MERGED_DB_NAME);
    await createArtistSnapshotsTable(targetDb);

    const sourceDbFileNames = await getSourceDbFileNames();

    const startLabel = `Merging ${sourceDbFileNames.length} partial databases...`;
    console.log(startLabel);

    const endLabel = `Merged ${sourceDbFileNames.length} partial databases`;
    console.time(endLabel);

    for (const sourceDbFileName of sourceDbFileNames) {
        const sourceDb = await openDb(sourceDbFileName);
        const sourceRecords = await sourceDb.all<ArtistSnapshotRow[]>(
            "SELECT * FROM artist_snapshots;"
        );
        await bulkExecute(
            targetDb,
            sourceRecords,
            generateInsertArtistSnapshotStatements
        );
    }

    await createArtistSnapshotsIndexes(targetDb);

    console.timeEnd(endLabel);
};

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
