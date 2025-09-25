import sqlite3 from "sqlite3";
import { Database, open, ISqlite } from "sqlite";
import { glob } from "fs/promises";
import { ArtistSnapshotRow } from "@repo/common";
import { chunk, isEmpty } from "lodash";
import { PARTIAL_DB_PATTERN } from "../constants/storage";

const MERGED_DB_NAME = "merged-spotify-data.db";

const main = async () => {
    const targetDb = await openDb(MERGED_DB_NAME);
    createArtistSnapshotsTable(targetDb);

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
        bulkExecute(
            targetDb,
            sourceRecords,
            generateInsertArtistSnapshotStatements
        );
    }

    console.timeEnd(endLabel);
};

const createArtistSnapshotsTable = (
    db: Database<sqlite3.Database, sqlite3.Statement>
) => {
    db.exec(`
    CREATE TABLE IF NOT EXISTS artist_snapshots (
        id TEXT,
        timestamp NUMERIC,
        followers NUMERIC,
        popularity NUMERIC,
        UNIQUE (id, timestamp)
    )`);
};

const bulkExecute = <T>(
    db: Database<sqlite3.Database, sqlite3.Statement>,
    items: T[],
    generateStatements: (items: T[]) => ISqlite.SQLStatement[],
    chunkSize = 50,
    flushAfter = 500
) => {
    let statements: ISqlite.SQLStatement[] = [];
    const itemChunks = chunk(items, chunkSize);
    itemChunks.forEach((itemChunk) => {
        statements = [...statements, ...generateStatements(itemChunk)];
        const flushed = flushStatementsIfNeeded(db, statements, flushAfter);
        if (flushed) {
            statements = [];
        }
    });

    flushStatements(db, statements);
};

const flushStatementsIfNeeded = (
    db: Database<sqlite3.Database, sqlite3.Statement>,
    statements: ISqlite.SQLStatement[],
    flushAfter: number
): boolean => {
    if (statements.length < flushAfter) {
        return false;
    }

    flushStatements(db, statements);
    return true;
};

const flushStatements = (
    db: Database<sqlite3.Database, sqlite3.Statement>,
    statements: ISqlite.SQLStatement[]
) => {
    if (isEmpty(statements)) {
        return;
    }

    db.getDatabaseInstance().serialize(() => {
        db.run("BEGIN TRANSACTION");
        statements.forEach((statement) => {
            db.exec(statement);
        });
        db.run("COMMIT");
    });
};

const generateInsertArtistSnapshotStatements = (
    snapshots: ArtistSnapshotRow[]
): ISqlite.SQLStatement[] =>
    snapshots.map(generateInsertArtistSnapshotStatement);

const generateInsertArtistSnapshotStatement = (
    snapshot: ArtistSnapshotRow
): ISqlite.SQLStatement => {
    const values = [
        snapshot.id,
        snapshot.timestamp,
        snapshot.popularity,
        snapshot.followers,
    ];

    return {
        sql: "INSERT OR IGNORE INTO artist_snapshots (id, timestamp, popularity, followers) VALUES (?, ?, ?, ?);",
        values,
    };
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
