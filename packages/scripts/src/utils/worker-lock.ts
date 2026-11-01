import { openDb } from "./db-utils";

// A separate SQLite connection holds the process lock. SQLite releases it even
// after SIGKILL/container restarts; registry edits use a different database.
const withWorkerLock = async (
    work: () => Promise<void>,
    filename = "sync-worker-lock.db"
): Promise<boolean> => {
    const db = await openDb(filename);
    let locked = false;
    try {
        await db.exec("PRAGMA busy_timeout = 0;");
        try {
            await db.exec("BEGIN EXCLUSIVE;");
            locked = true;
        } catch (error) {
            if ((error as { code?: string }).code === "SQLITE_BUSY") {
                return false;
            }
            throw error;
        }
        await work();
        return true;
    } finally {
        if (locked) {
            await db.exec("ROLLBACK");
        }
        await db.close();
    }
};

export { withWorkerLock };
