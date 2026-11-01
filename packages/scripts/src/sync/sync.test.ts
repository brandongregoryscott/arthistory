import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ArtistPageError } from "../utils/artist-html";
import { openDb } from "../utils/db-utils";
import { withWorkerLock } from "../utils/worker-lock";
import { getDueArtists, openRegistry } from "./registry";
import { collectArtists } from "./sync";

const settings = {
    cooldownMs: 86400000,
    failureDelayMs: 86400000,
    intervalMs: 86400000,
    maxRequests: 2,
    spacingMs: 60000,
};

test("legacy registry migration is idempotent and defaults all artists off", async () => {
    const dir = await mkdtemp(join(tmpdir(), "artist-registry-"));
    const file = join(dir, "registry.db");
    try {
        const legacy = await openDb(file);
        await legacy.exec(
            "CREATE TABLE artist_ids (id TEXT PRIMARY KEY); INSERT INTO artist_ids VALUES ('old')"
        );
        await legacy.close();
        for (let i = 0; i < 2; i++) {
            const db = await openRegistry(file);
            assert.deepEqual(
                await db.get("SELECT id, sync_enabled FROM artist_ids"),
                { id: "old", sync_enabled: 0 }
            );
            assert.deepEqual(
                await getDueArtists(db, Date.now(), settings.intervalMs, 5),
                []
            );
            await db.close();
        }
    } finally {
        await rm(dir, { force: true, recursive: true });
    }
});

test("daily selection, spacing, request cap, durable outbox, and restart cooldown", async () => {
    const dir = await mkdtemp(join(tmpdir(), "artist-collection-"));
    const file = join(dir, "registry.db");
    let db = await openRegistry(file);
    let now = 1800000000000;
    const requested: string[] = [];
    try {
        await db.exec(
            "INSERT INTO artist_ids (id, sync_enabled) VALUES ('a',1), ('b',1), ('c',1), ('disabled',0)"
        );
        const deps = {
            fetchStats: async (id: string) => {
                requested.push(id);
                return { followers: 123, monthlyListeners: 456 };
            },
            now: () => now,
            sleep: async (ms: number) => {
                assert.equal(ms, 60000);
                now += ms;
            },
        };
        await collectArtists(db, settings, deps);
        assert.deepEqual(requested, ["a", "b"]);
        assert.equal(
            (await db.get("SELECT COUNT(*) AS n FROM sync_outbox")).n,
            2
        );
        assert.equal(
            (await db.get("SELECT popularity FROM sync_outbox LIMIT 1"))
                .popularity,
            null
        );
        assert.deepEqual(await getDueArtists(db, now, settings.intervalMs, 5), [
            { id: "c" },
        ]);
        await db.close();
        db = await openRegistry(file);
        await collectArtists(db, settings, deps);
        assert.deepEqual(requested, ["a", "b"]);
        now += 60000;
        await collectArtists(db, settings, {
            ...deps,
            fetchStats: async () => {
                throw new ArtistPageError(429, 172800000);
            },
        });
        await db.close();
        db = await openRegistry(file);
        assert.equal(
            (await db.get("SELECT next_request_at FROM sync_state"))
                .next_request_at,
            now + 172800000
        );
        await collectArtists(db, settings, deps);
        assert.deepEqual(requested, ["a", "b"]);
    } finally {
        await db.close();
        await rm(dir, { force: true, recursive: true });
    }
});

test("parser failure stops the roster and 404 defers only the missing artist", async () => {
    const db = await openRegistry(":memory:");
    let calls = 0;
    let now = 1800000000000;
    try {
        await db.exec(
            "INSERT INTO artist_ids (id, sync_enabled) VALUES ('a',1), ('b',1)"
        );
        const deps = {
            fetchStats: async () => {
                calls++;
                throw new Error("Missing page state");
            },
            now: () => now,
            sleep: async (ms: number) => {
                now += ms;
            },
        };
        await collectArtists(db, settings, deps);
        assert.equal(calls, 1);
        assert.equal(
            (await db.get("SELECT COUNT(*) AS n FROM sync_outbox")).n,
            0
        );
        now += settings.cooldownMs;
        await collectArtists(db, settings, {
            ...deps,
            fetchStats: async () => {
                calls++;
                throw new ArtistPageError(404, 0);
            },
        });
        assert.equal(calls, 3);
    } finally {
        await db.close();
    }
});

test("worker lock excludes a second connection and releases after failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "artist-lock-"));
    const file = join(dir, "lock.db");
    try {
        assert.equal(
            await withWorkerLock(async () => {
                assert.equal(
                    await withWorkerLock(async () => {
                        assert.fail("must not run");
                    }, file),
                    false
                );
            }, file),
            true
        );
        await assert.rejects(
            withWorkerLock(async () => {
                throw new Error("crash");
            }, file),
            /crash/
        );
        assert.equal(await withWorkerLock(async () => {}, file), true);
    } finally {
        await rm(dir, { force: true, recursive: true });
    }
});
