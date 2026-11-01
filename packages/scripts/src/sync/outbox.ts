import type { ArtistSnapshotRow } from "@repo/common";
import { rename, rm } from "node:fs/promises";
import type { Database } from "../types";
import { BucketName } from "../constants/storage";
import { uploadObject } from "../upload-object/upload-object";
import {
    buildInsertArtistSnapshotStatement,
    createArtistSnapshotsTable,
    flushStatements,
    getSnapshotDbFilename,
    openDb,
} from "../utils/db-utils";

const publishPending = async (registry: Database, upload = uploadObject) => {
    const rows = await registry.all<ArtistSnapshotRow[]>(
        "SELECT * FROM sync_outbox ORDER BY timestamp, id"
    );
    const [first] = rows;
    if (first === undefined) {
        return;
    }
    const filename = getSnapshotDbFilename(first.timestamp);
    const temporary = `${filename}.building`;
    await rm(temporary, { force: true });
    const db = await openDb(temporary);
    try {
        await createArtistSnapshotsTable(db);
        await db.exec(
            "CREATE UNIQUE INDEX artist_snapshots_identity ON artist_snapshots (id, timestamp)"
        );
        await flushStatements(db, rows.map(buildInsertArtistSnapshotStatement));
    } finally {
        await db.close();
    }
    await rename(temporary, filename);
    await upload({ bucket: BucketName.Snapshots, filename });
    // An interrupted upload/ack leaves the outbox intact. The next run reuses
    // the same key/content and does not contact Spotify for those observations.
    await registry.exec("BEGIN IMMEDIATE");
    try {
        for (const row of rows) {
            await registry.run(
                "DELETE FROM sync_outbox WHERE id = ? AND timestamp = ?",
                row.id,
                row.timestamp
            );
        }
        await registry.exec("COMMIT");
    } catch (error) {
        await registry.exec("ROLLBACK");
        throw error;
    }
};

export { publishPending };
