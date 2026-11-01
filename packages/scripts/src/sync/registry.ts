import type { Database } from "../types";
import { DatabaseName } from "../constants/storage";
import { openDb } from "../utils/db-utils";

const openRegistry = async (
    filename: string = DatabaseName.ArtistIds
): Promise<Database> => {
    const db = await openDb(filename);
    try {
        await db.exec("PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;");
        await db.exec(
            "CREATE TABLE IF NOT EXISTS artist_ids (id TEXT PRIMARY KEY);"
        );
        const columns = await db.all<Array<{ name: string }>>(
            "PRAGMA table_info(artist_ids)"
        );
        for (const [name, definition] of Object.entries({
            last_success_at: "INTEGER",
            next_attempt_at: "INTEGER NOT NULL DEFAULT 0",
            sync_enabled:
                "INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0, 1))",
        })) {
            if (!columns.some((column) => column.name === name)) {
                await db.exec(
                    `ALTER TABLE artist_ids ADD COLUMN ${name} ${definition}`
                );
            }
        }
        await db.exec(`
            CREATE INDEX IF NOT EXISTS artist_ids_sync_due ON artist_ids(sync_enabled, next_attempt_at, last_success_at);
            CREATE TABLE IF NOT EXISTS sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), next_request_at INTEGER NOT NULL DEFAULT 0);
            INSERT OR IGNORE INTO sync_state (id) VALUES (1);
            CREATE TABLE IF NOT EXISTS sync_outbox (
                id TEXT NOT NULL, timestamp INTEGER NOT NULL, followers INTEGER NOT NULL,
                monthly_listeners INTEGER NOT NULL, popularity NUMERIC,
                PRIMARY KEY (id, timestamp)
            );
            COMMIT;
        `);
        return db;
    } catch (error) {
        await db.exec("ROLLBACK").catch(() => undefined);
        await db.close();
        throw error;
    }
};

const getDueArtists = (
    db: Database,
    now: number,
    intervalMs: number,
    limit: number
) =>
    db.all<Array<{ id: string }>>(
        `
        SELECT id FROM artist_ids WHERE sync_enabled = 1 AND next_attempt_at <= ?
        AND (last_success_at IS NULL OR last_success_at <= ?)
        ORDER BY COALESCE(last_success_at, 0), next_attempt_at, id LIMIT ?
    `,
        now,
        now - intervalMs,
        limit
    );

export { getDueArtists, openRegistry };
