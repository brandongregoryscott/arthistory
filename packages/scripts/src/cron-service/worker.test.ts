import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BucketName } from "../constants/storage";
import { mergeDbs } from "../merge-dbs/merge-dbs";
import { publishPending } from "../sync/outbox";
import { openRegistry } from "../sync/registry";
import { openDb } from "../utils/db-utils";
import { getDbFilenames } from "../utils/fs-utils";
import { mergeAndBackup } from "./worker";

const inTemporaryDirectory = async (work: () => Promise<void>) => {
    const previous = process.cwd();
    const dir = await mkdtemp(join(tmpdir(), "artist-worker-"));
    process.chdir(dir);
    try {
        await work();
    } finally {
        process.chdir(previous);
        await rm(dir, { force: true, recursive: true });
    }
};

const createPartial = async (
    filename: string,
    timestamp: number,
    modern = false
) => {
    const db = await openDb(filename);
    try {
        await db.exec(
            `CREATE TABLE artist_snapshots (id TEXT, timestamp NUMERIC, followers NUMERIC, popularity NUMERIC${modern ? ", monthly_listeners NUMERIC" : ""})`
        );
        await db.run(
            `INSERT INTO artist_snapshots VALUES ('artist', ?, 123, ${modern ? "NULL, 456" : "70"})`,
            timestamp
        );
    } finally {
        await db.close();
    }
};

test("outbox survives failed upload and republishes a closed database without collection", async () =>
    inTemporaryDirectory(async () => {
        const registry = await openRegistry();
        try {
            await registry.exec(
                "INSERT INTO sync_outbox VALUES ('artist', 1800000000, 123, 456, NULL)"
            );
            const keys: string[] = [];
            await assert.rejects(
                publishPending(registry, async ({ filename }) => {
                    keys.push(filename);
                    throw new Error("offline");
                }),
                /offline/
            );
            assert.equal(
                (await registry.get("SELECT COUNT(*) AS n FROM sync_outbox")).n,
                1
            );
            await publishPending(registry, async ({ filename }) => {
                keys.push(filename);
                const db = await openDb(filename);
                try {
                    assert.deepEqual(
                        await db.get("SELECT * FROM artist_snapshots"),
                        {
                            followers: 123,
                            id: "artist",
                            monthly_listeners: 456,
                            popularity: null,
                            timestamp: 1800000000,
                        }
                    );
                    assert.equal(
                        (await db.get("PRAGMA quick_check")).quick_check,
                        "ok"
                    );
                } finally {
                    await db.close();
                }
            });
            assert.deepEqual(keys, [
                "spotify-data_1800000000.db",
                "spotify-data_1800000000.db",
            ]);
            assert.equal(
                (await registry.get("SELECT COUNT(*) AS n FROM sync_outbox")).n,
                0
            );
        } finally {
            await registry.close();
        }
    }));

test("merge preserves legacy metrics, new listeners, normalizes milliseconds, and ignores replayed observations", async () =>
    inTemporaryDirectory(async () => {
        await createPartial("spotify-data_old.db", 1700000000000);
        await createPartial("spotify-data_new.db", 1800000000, true);
        await createPartial("spotify-data_replayed.db", 1800000000, true);
        const sources = await getDbFilenames();
        await mergeDbs({
            filename: "first.db",
            skipCheckpointAsBase: true,
            skipIndexes: false,
            sources,
        });
        await mergeDbs({
            checkpoint: "first.db",
            filename: "second.db",
            skipCheckpointAsBase: false,
            skipIndexes: false,
            sources: ["first.db", ...sources],
        });
        const db = await openDb("second.db");
        try {
            const rows = await db.all(
                "SELECT * FROM artist_snapshots ORDER BY timestamp"
            );
            assert.equal(rows.length, 2);
            assert.equal(rows[0].timestamp, 1700000000);
            assert.equal(rows[0].popularity, 70);
            assert.equal(rows[0].monthly_listeners, null);
            assert.equal(rows[1].popularity, null);
            assert.equal(rows[1].monthly_listeners, 456);
        } finally {
            await db.close();
        }
    }));

test("backup failure preserves sources; interrupted cleanup resumes its captured inputs", async () =>
    inTemporaryDirectory(async () => {
        const registry = await openRegistry();
        await registry.close();
        await createPartial("spotify-data_first.db", 1700000000);
        const deleted: string[][] = [];
        let failBackup = true;
        let failDelete = true;
        const dependencies = {
            deleteKeys: async (keys: string[]) => {
                deleted.push(keys);
                if (failDelete) {
                    // A later partial must not be included in recovery cleanup.
                    await createPartial(
                        "spotify-data_later.db",
                        1800000000,
                        true
                    );
                    throw new Error("delete offline");
                }
            },
            download: async () => {},
            list: async () => (await getDbFilenames()).map((Key) => ({ Key })),
            upload: async ({
                bucket,
            }: {
                bucket: string;
                filename: string;
                key?: string;
            }) => {
                if (bucket === BucketName.SnapshotBackups && failBackup) {
                    throw new Error("backup offline");
                }
            },
        };
        await assert.rejects(mergeAndBackup(dependencies), /backup offline/);
        assert.equal(existsSync("spotify-data_first.db"), true);
        assert.equal(existsSync("sync-checkpoint.json"), false);
        assert.deepEqual(deleted, []);
        failBackup = false;
        await assert.rejects(mergeAndBackup(dependencies), /delete offline/);
        const pending = JSON.parse(
            await readFile("sync-checkpoint.json", "utf8")
        );
        assert.deepEqual(pending.cleanup, ["spotify-data_first.db"]);
        assert.equal(existsSync(pending.checkpoint), true);
        assert.equal(existsSync("spotify-data_first.db"), true);
        failDelete = false;
        await mergeAndBackup(dependencies);
        assert.deepEqual(deleted[1], ["spotify-data_first.db"]);
        const completed = JSON.parse(
            await readFile("sync-checkpoint.json", "utf8")
        );
        assert.deepEqual(completed.cleanup, []);
        assert.equal(existsSync("spotify-data_first.db"), false);
        const db = await openDb(completed.checkpoint);
        try {
            assert.equal(
                (await db.get("SELECT COUNT(*) AS n FROM artist_snapshots")).n,
                2
            );
        } finally {
            await db.close();
        }
    }));
