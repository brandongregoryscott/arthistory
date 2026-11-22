import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PocketBaseClient } from "../storage/pocketbase";
import { loadImport } from "./load-import";
import { prepareImport } from "./prepare-import";

type Stored = { [key: string]: unknown; id: string };
type Request = { body: Stored; method: string; url: string };

const config = {
    email: "owner@example.com",
    password: "test-password",
    url: "http://pocketbase.invalid",
};

const token = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;

describe("loadImport", () => {
    let root: string;
    let directory: string;

    beforeEach(() => {
        root = mkdtempSync(resolve(tmpdir(), "import-loader-"));
        directory = resolve(root, "export");
        const filename = resolve(root, "legacy.db");
        const db = new DatabaseSync(filename);

        db.exec(`CREATE TABLE artist_snapshots (id TEXT, timestamp NUMERIC, followers NUMERIC, popularity NUMERIC);
            INSERT INTO artist_snapshots VALUES
            ('1111111111111111111111', 1767571200, 10000, 0),
            ('1111111111111111111111', 1768176000, NULL, NULL),
            ('2222222222222222222222', 1767571200, 12000, 10),
            ('2222222222222222222222', 1768176000, 13000, 20)`);
        db.close();

        prepareImport({
            output: directory,
            source: { filename, timestampUnit: "seconds" },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        rmSync(root, { force: true, recursive: true });
    });

    it("loads bounded POST batches in relationship order and reruns without overwriting owner edits", async () => {
        const remote = mockPocketBase();

        const first = await loadImport({
            batchSize: 2,
            client: new PocketBaseClient(config),
            directory,
        });

        expect(first).toEqual({
            artists: 2,
            created: 6,
            skipped: 0,
            snapshots: 4,
        });
        expect(
            remote.batches.every(
                (batch) =>
                    batch.length <= 2 &&
                    batch.every((request) => request.method === "POST")
            )
        ).toBe(true);
        expect(
            [...remote.records.artists.values()].every(
                (artist) => artist.syncEnabled === false
            )
        ).toBe(true);
        expect(
            [...remote.records.snapshots.values()].some(
                (row) => row.followers === -1
            )
        ).toBe(true);

        const imported = [...remote.records.snapshots.values()];
        expect(imported.every((row) => !Object.hasOwn(row, "metrics"))).toBe(
            true
        );
        expect(imported).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    followers: 10000,
                    monthlyListeners: -1,
                    popularity: 0,
                }),
                expect.objectContaining({
                    followers: 13000,
                    monthlyListeners: -1,
                    popularity: 20,
                }),
            ])
        );

        const [artist] = remote.records.artists.values();
        if (artist == null) {
            throw new Error("Missing artist.");
        }
        artist.displayName = "Owner correction";
        artist.syncEnabled = true;

        const [snapshot] = remote.records.snapshots.values();
        if (snapshot == null) {
            throw new Error("Missing snapshot.");
        }
        snapshot.capturedAt = "2026-01-13 00:00:00.000Z";
        Object.assign(snapshot, {
            followers: 20000,
            monthlyListeners: 30000,
            popularity: 42,
        });
        const batchCount = remote.batches.length;

        const second = await loadImport({
            batchSize: 2,
            client: new PocketBaseClient(config),
            directory,
        });

        expect(second).toEqual({
            artists: 2,
            created: 0,
            skipped: 6,
            snapshots: 4,
        });
        expect(remote.batches).toHaveLength(batchCount);
        expect(artist).toMatchObject({
            displayName: "Owner correction",
            syncEnabled: true,
        });
        expect(snapshot).toMatchObject({
            followers: 20000,
            monthlyListeners: 30000,
            popularity: 42,
        });
    });

    it.each([50, 100])(
        "bounds identity filters independently of %i-record write batches",
        async (batchSize) => {
            const source = {
                filename: resolve(root, "legacy.db"),
                timestampUnit: "seconds" as const,
            };
            const db = new DatabaseSync(source.filename);
            db.exec("DELETE FROM artist_snapshots");
            const insert = db.prepare(
                "INSERT INTO artist_snapshots VALUES (?, ?, ?, ?)"
            );
            for (let week = 0; week < 120; week++) {
                insert.run(
                    "1111111111111111111111",
                    1768176000 - week * 604800,
                    10000,
                    null
                );
            }
            db.close();
            rmSync(directory, { recursive: true });
            prepareImport({ output: directory, source });
            const remote = mockPocketBase();
            const options = {
                batchSize,
                client: new PocketBaseClient(config),
                directory,
            };

            expect(await loadImport(options)).toMatchObject({
                created: 121,
                skipped: 0,
            });
            expect(
                remote.batches.some((batch) => batch.length === batchSize)
            ).toBe(true);
            const writes = remote.batches.length;
            expect(await loadImport(options)).toMatchObject({
                created: 0,
                skipped: 121,
            });
            expect(remote.batches).toHaveLength(writes);
            const lookups = remote.fetch.mock.calls
                .map((call) =>
                    new URL(String(call[0])).searchParams.get("filter")
                )
                .filter((filter) => filter != null);
            expect(lookups.length).toBeGreaterThan(4);
            expect(
                lookups.every((filter) => Buffer.byteLength(filter) <= 3500)
            ).toBe(true);

            const snapshot = [...remote.records.snapshots.values()].find(
                (_, index) => index === 25
            );
            if (snapshot == null) {
                throw new Error("Missing fixture snapshot.");
            }
            remote.records.snapshots.set("foreignrecordid", {
                ...snapshot,
                id: "foreignrecordid",
            });
            await expect(loadImport(options)).rejects.toThrow(
                "Conflicting snapshots record"
            );
            expect(remote.batches).toHaveLength(writes);
        }
    );

    it("reports validation before connecting and counts matching records on a restarted run", async () => {
        const remote = mockPocketBase();
        const onProgress = vi.fn();
        const options = {
            client: new PocketBaseClient(config),
            directory,
            onProgress,
        };
        await loadImport(options);
        expect(onProgress.mock.calls.map(([event]) => event.phase)).toEqual([
            "validating",
            "validating",
            "connecting",
            "importing",
            "complete",
        ]);
        expect(onProgress.mock.calls[0]?.[0]).toMatchObject({
            phase: "validating",
            processed: 0,
            total: 6,
        });
        expect(onProgress.mock.calls[1]?.[0]).toMatchObject({
            percent: 100,
            phase: "validating",
            processed: 6,
        });
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({
                created: 6,
                phase: "complete",
                processed: 6,
                skipped: 0,
            })
        );
        const batches = remote.batches.length;
        onProgress.mockClear();
        await loadImport(options);
        expect(onProgress.mock.calls[0]?.[0]).toMatchObject({
            phase: "validating",
            processed: 0,
        });
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({
                created: 0,
                phase: "complete",
                processed: 6,
                skipped: 6,
            })
        );
        expect(remote.batches).toHaveLength(batches);
    });

    it.each(["rejection", "lost response"] as const)(
        "recovers from %s without replaying ambiguous writes automatically",
        async (failure) => {
            const remote = mockPocketBase();
            remote.failure = failure;

            await expect(
                loadImport({
                    batchSize: 2,
                    client: new PocketBaseClient(config),
                    directory,
                })
            ).rejects.toThrow();

            expect(remote.batches).toHaveLength(1);
            const committed = failure === "lost response" ? 2 : 0;
            expect(
                remote.records.artists.size + remote.records.snapshots.size
            ).toBe(committed);

            const result = await loadImport({
                batchSize: 2,
                client: new PocketBaseClient(config),
                directory,
            });

            expect(result.created).toBe(6 - committed);
            expect(result.skipped).toBe(committed);
            expect(
                remote.records.artists.size + remote.records.snapshots.size
            ).toBe(6);
        }
    );

    it("identifies a failed write batch and acknowledged counts", async () => {
        const remote = mockPocketBase();
        remote.failure = "rejection";
        const failure = await loadImport({
            batchSize: 2,
            client: new PocketBaseClient(config),
            directory,
        }).catch((error: Error) => error);
        expect(failure).toBeInstanceOf(Error);
        if (!(failure instanceof Error)) {
            throw new Error("Expected import failure.");
        }
        expect(JSON.parse(failure.message)).toMatchObject({
            batch: 1,
            created: 0,
            message: "Batch rejected",
            pocketbase: { status: 400 },
            records: expect.arrayContaining([
                expect.objectContaining({ collection: "artists" }),
                expect.objectContaining({ collection: "snapshots" }),
            ]),
            stage: "Create PocketBase record batch",
        });
        expect(remote.batches).toHaveLength(1);
    });

    it("identifies an authentication failure before any writes", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json(
                    { message: "Failed to authenticate." },
                    { status: 400 }
                )
            )
        );
        const failure = await loadImport({
            client: new PocketBaseClient(config),
            directory,
        }).catch((error: Error) => error);
        if (!(failure instanceof Error)) {
            throw new Error("Expected import failure.");
        }
        expect(JSON.parse(failure.message)).toMatchObject({
            batch: 0,
            created: 0,
            pocketbase: {
                status: 400,
            },
            records: [],
            stage: "Check PocketBase authentication and required collections",
        });
        expect(failure.message).not.toContain(config.password);
    });

    it("adds lookup context to PocketBase's generic server error", async () => {
        const remote = mockPocketBase();
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string, options: RequestInit) => {
                if (new URL(input).searchParams.has("filter")) {
                    return Response.json(
                        {
                            message:
                                "Something went wrong while processing your request.",
                        },
                        { status: 500 }
                    );
                }
                return remote.fetch(input, options);
            })
        );
        const failure = await loadImport({
            client: new PocketBaseClient(config),
            directory,
        }).catch((error: Error) => error);
        if (!(failure instanceof Error)) {
            throw new Error("Expected import failure.");
        }
        expect(JSON.parse(failure.message)).toMatchObject({
            batch: 1,
            created: 0,
            message: "Something went wrong while processing your request.",
            pocketbase: { hint: expect.stringContaining("Logs"), status: 500 },
            records: [
                expect.objectContaining({ collection: "artists" }),
                expect.objectContaining({ collection: "artists" }),
            ],
            stage: "Look up existing artists records",
        });
        expect(remote.batches).toHaveLength(0);
    });

    it("stops on conflicting snapshot values without changing the stored capture", async () => {
        const remote = mockPocketBase();
        await loadImport({ client: new PocketBaseClient(config), directory });

        const [snapshot] = remote.records.snapshots.values();
        if (snapshot == null) {
            throw new Error("Missing snapshot.");
        }
        Object.assign(snapshot, {
            followers: 99,
            monthlyListeners: -1,
            popularity: -1,
        });
        const batches = remote.batches.length;

        await expect(
            loadImport({ client: new PocketBaseClient(config), directory })
        ).rejects.toThrow("Conflicting snapshots");

        expect(remote.batches).toHaveLength(batches);
        expect(snapshot).toMatchObject({
            followers: 99,
            monthlyListeners: -1,
            popularity: -1,
        });
    });

    it("uses separately indexed ID and natural-key reads without total counts", async () => {
        const remote = mockPocketBase();
        await loadImport({ client: new PocketBaseClient(config), directory });
        const queries = remote.fetch.mock.calls
            .map(([url]) => new URL(String(url)))
            .filter((url) => url.searchParams.has("filter"));
        expect(queries.length).toBeGreaterThan(2);
        for (const url of queries) {
            const filter = url.searchParams.get("filter") ?? "";
            const sort = url.searchParams.get("sort");
            expect(url.searchParams.get("skipTotal")).toBe("true");
            if (/\bid = /.test(filter)) {
                expect(filter).not.toContain("artist =");
                expect(filter).not.toContain("spotifyId =");
                expect(sort).toBe("id");
            } else if (filter.includes("spotifyId =")) {
                expect(sort).toBe("spotifyId");
            } else {
                expect(filter.match(/artist =/g)).toHaveLength(1);
                expect(sort).toBe("artist,weekStart");
            }
        }
    });

    it("still detects an incoming snapshot ID already used by a different artist", async () => {
        const remote = mockPocketBase();
        const [line] = readFileSync(
            resolve(directory, "snapshots.jsonl"),
            "utf8"
        ).split("\n");
        if (line == null) {
            throw new Error("Missing fixture snapshot.");
        }
        const incoming = JSON.parse(line);
        remote.records.snapshots.set(incoming.id, {
            ...incoming,
            artist: "otherartist0001",
        });
        await expect(
            loadImport({ client: new PocketBaseClient(config), directory })
        ).rejects.toThrow("Conflicting snapshots record");
        expect(remote.batches).toHaveLength(0);
        expect(remote.records.snapshots.get(incoming.id)?.artist).toBe(
            "otherartist0001"
        );
    });

    it("recognizes an existing weekly row under a different ID and native date format", async () => {
        const remote = mockPocketBase();
        await loadImport({ client: new PocketBaseClient(config), directory });

        const [snapshot] = remote.records.snapshots.values();
        if (snapshot == null) {
            throw new Error("Missing snapshot.");
        }
        remote.records.snapshots.delete(snapshot.id);
        snapshot.id = "alternativesnap";
        snapshot.weekStart = String(snapshot.weekStart).replace("T", " ");
        remote.records.snapshots.set(snapshot.id, snapshot);
        const batchCount = remote.batches.length;

        const result = await loadImport({
            client: new PocketBaseClient(config),
            directory,
        });

        expect(result.skipped).toBe(6);
        expect(remote.batches).toHaveLength(batchCount);
    });

    it("rejects a pre-existing artist under a different ID without changing enrollment", async () => {
        const remote = mockPocketBase();
        remote.records.artists.set("otherartist0001", {
            id: "otherartist0001",
            spotifyId: "1111111111111111111111",
            syncEnabled: true,
        });

        await expect(
            loadImport({ client: new PocketBaseClient(config), directory })
        ).rejects.toThrow("Conflicting artists");

        expect(remote.batches).toHaveLength(0);
        expect(remote.records.artists.get("otherartist0001")?.syncEnabled).toBe(
            true
        );
    });

    it.each(["metrics", "count", "enrollment", "orphan", "oversized"] as const)(
        "validates %s before making any target requests",
        async (problem) => {
            const remote = mockPocketBase();
            const file = resolve(
                directory,
                problem === "count" ? "report.json" : "snapshots.jsonl"
            );

            if (problem === "count") {
                const report = JSON.parse(readFileSync(file, "utf8"));
                report.counts.snapshots++;
                writeFileSync(file, JSON.stringify(report));
            } else if (problem === "enrollment") {
                const artists = readFileSync(
                    resolve(directory, "artists.jsonl"),
                    "utf8"
                ).replaceAll('"syncEnabled":false', '"syncEnabled":true');
                writeFileSync(resolve(directory, "artists.jsonl"), artists);
            } else if (problem === "oversized") {
                writeFileSync(file, "x".repeat(20000));
            } else {
                const rows = readFileSync(file, "utf8")
                    .trim()
                    .split("\n")
                    .map((line) => JSON.parse(line));
                if (problem === "metrics") {
                    delete rows[rows.length - 1].metrics.followers;
                }
                if (problem === "orphan") {
                    rows[rows.length - 1].artist = "orphanartist001";
                }
                writeFileSync(
                    file,
                    rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
                );
            }

            await expect(
                loadImport({ client: new PocketBaseClient(config), directory })
            ).rejects.toThrow();

            expect(remote.fetch).not.toHaveBeenCalled();
            expect(existsSync(directory)).toBe(true);
        }
    );

    it("freezes validated inputs before target interaction", async () => {
        const remote = mockPocketBase();
        remote.onAuth = () =>
            writeFileSync(
                resolve(directory, "snapshots.jsonl"),
                "corrupted after validation"
            );

        const result = await loadImport({
            client: new PocketBaseClient(config),
            directory,
        });

        expect(result.created).toBe(6);
    });

    it("skips whole-export preflight when requested and still reconciles existing records", async () => {
        const remote = mockPocketBase();
        const onProgress = vi.fn();
        const options = {
            client: new PocketBaseClient(config),
            directory,
            onProgress,
            skipPreflight: true,
        };
        expect(await loadImport(options)).toMatchObject({
            created: 6,
            skipped: 0,
        });
        expect(onProgress.mock.calls.map(([event]) => event.phase)).toEqual([
            "connecting",
            "importing",
            "complete",
        ]);
        const writes = remote.batches.length;
        expect(await loadImport(options)).toMatchObject({
            created: 0,
            skipped: 6,
        });
        expect(remote.batches).toHaveLength(writes);
    });

    it.each(["LF", "CRLF", "unterminated"])(
        "resumes %s files at byte offsets and replays an unconfirmed batch",
        async (format) => {
            for (const name of ["artists.jsonl", "snapshots.jsonl"]) {
                const file = resolve(directory, name);
                const value = readFileSync(file, "utf8");
                let contents = value;
                if (format === "CRLF") {
                    contents = value.replaceAll("\n", "\r\n");
                } else if (format === "unterminated") {
                    contents = value.trimEnd();
                }
                writeFileSync(file, contents);
            }
            const remote = mockPocketBase();
            const checkpointPath = resolve(root, "checkpoint.json");
            remote.onBatch = () => {
                if (remote.batches.length === 3) {
                    remote.failure = "lost response";
                }
            };
            const options = {
                batchSize: 2,
                checkpointPath,
                client: new PocketBaseClient(config),
                directory,
            };
            await expect(loadImport(options)).rejects.toThrow();
            const saved = JSON.parse(readFileSync(checkpointPath, "utf8"));
            expect(saved.cursor).toMatchObject({ artists: 1, snapshots: 2 });
            expect(saved.cursor.artistsOffset).toBeGreaterThan(0);
            expect(saved.cursor.snapshotsOffset).toBeGreaterThan(0);
            expect(
                remote.records.artists.size + remote.records.snapshots.size
            ).toBe(6);
            remote.onBatch = () => {};
            const writes = remote.batches.length;
            expect(await loadImport(options)).toMatchObject({
                created: 0,
                resumed: 3,
                skipped: 3,
            });
            expect(remote.batches).toHaveLength(writes);
            remote.fetch.mockClear();
            expect(await loadImport(options)).toMatchObject({
                created: 0,
                resumed: 6,
                skipped: 0,
            });
            expect(remote.batches).toHaveLength(writes);
            expect(
                remote.fetch.mock.calls.filter(([url]) =>
                    new URL(String(url)).searchParams.has("filter")
                )
            ).toHaveLength(1);
        }
    );

    it("seeds a checkpoint from a confirmed progress count without replaying earlier lookups", async () => {
        const remote = mockPocketBase();
        remote.onBatch = () => {
            if (remote.batches.length === 2) {
                remote.failure = "rejection";
            }
        };
        const client = new PocketBaseClient(config);
        await expect(
            loadImport({ batchSize: 2, client, directory })
        ).rejects.toThrow();
        expect(
            remote.records.artists.size + remote.records.snapshots.size
        ).toBe(2);
        remote.onBatch = () => {};
        remote.fetch.mockClear();
        const checkpointPath = resolve(root, "checkpoint.json");
        const onProgress = vi.fn();
        const result = await loadImport({
            batchSize: 2,
            checkpointPath,
            client,
            directory,
            onProgress,
            resumeAfter: 2,
        });
        expect(result).toMatchObject({ created: 4, resumed: 2, skipped: 0 });
        expect(
            remote.fetch.mock.calls.some(
                ([url]) =>
                    new URL(String(url)).searchParams
                        .get("filter")
                        ?.includes('spotifyId = "1111111111111111111111"') ??
                    false
            )
        ).toBe(false);
        expect(
            onProgress.mock.calls.some(([event]) => event.phase === "seeking")
        ).toBe(true);
        expect(onProgress).toHaveBeenLastCalledWith(
            expect.objectContaining({
                phase: "complete",
                processed: 6,
                resumed: 2,
            })
        );
    });

    it.each(["source", "target", "restored", "cursor"] as const)(
        "refuses a stale or invalid %s checkpoint",
        async (problem) => {
            const remote = mockPocketBase();
            const checkpointPath = resolve(root, "checkpoint.json");
            const options = {
                checkpointPath,
                client: new PocketBaseClient(config),
                directory,
            };
            await loadImport(options);
            const writes = remote.batches.length;
            if (problem === "source") {
                const file = resolve(directory, "report.json");
                writeFileSync(file, readFileSync(file, "utf8") + " ");
            } else if (problem === "target") {
                options.client = new PocketBaseClient({
                    ...config,
                    url: "http://different.invalid",
                });
            } else if (problem === "restored") {
                remote.records.snapshots.clear();
            } else {
                const checkpoint = JSON.parse(
                    readFileSync(checkpointPath, "utf8")
                );
                checkpoint.cursor.snapshotsOffset = -1;
                writeFileSync(checkpointPath, JSON.stringify(checkpoint));
            }
            await expect(loadImport(options)).rejects.toThrow(
                /Checkpoint|checkpoint/
            );
            expect(remote.batches).toHaveLength(writes);
        }
    );

    it.each([-1, NaN, 1.1, 7])(
        "rejects invalid resume count %s before target requests",
        async (resumeAfter) => {
            const remote = mockPocketBase();
            await expect(
                loadImport({
                    client: new PocketBaseClient(config),
                    directory,
                    resumeAfter,
                })
            ).rejects.toThrow();
            expect(remote.fetch).not.toHaveBeenCalled();
        }
    );

    it.each(["metrics", "count", "orphan", "oversized"] as const)(
        "stops on a late %s error in streaming mode after earlier valid batches",
        async (problem) => {
            const remote = mockPocketBase();
            const file = resolve(directory, "snapshots.jsonl");
            const original = readFileSync(file, "utf8");
            const reportFile = resolve(directory, "report.json");
            const originalReport = readFileSync(reportFile, "utf8");
            if (problem === "count") {
                const report = JSON.parse(originalReport);
                report.counts.snapshots++;
                writeFileSync(reportFile, JSON.stringify(report));
            } else {
                const rows = original
                    .trim()
                    .split("\n")
                    .map((line) => JSON.parse(line));
                if (problem === "metrics") {
                    delete rows[rows.length - 1].metrics.followers;
                } else if (problem === "orphan") {
                    rows[rows.length - 1].artist = "orphanartist001";
                }
                const lines = rows.map((row) => JSON.stringify(row));
                if (problem === "oversized") {
                    lines[lines.length - 1] = "x".repeat(20000);
                }
                writeFileSync(file, lines.join("\n") + "\n");
            }
            const onProgress = vi.fn();
            const options = {
                batchSize: 2,
                client: new PocketBaseClient(config),
                directory,
                onProgress,
                skipPreflight: true,
            };
            await expect(loadImport(options)).rejects.toThrow(
                "Read prepared export records"
            );
            expect(remote.batches.length).toBeGreaterThan(0);
            const created =
                remote.records.artists.size + remote.records.snapshots.size;
            expect(created).toBeGreaterThan(0);
            expect(created).toBeLessThanOrEqual(6);
            expect(
                onProgress.mock.calls.some(
                    ([event]) => event.phase === "complete"
                )
            ).toBe(false);
            writeFileSync(file, original);
            writeFileSync(reportFile, originalReport);
            expect(await loadImport(options)).toMatchObject({
                created: 6 - created,
                skipped: created,
            });
        }
    );
});

const mockPocketBase = () => {
    const records = {
        artists: new Map<string, Stored>(),
        snapshots: new Map<string, Stored>(),
    };
    const remote = {
        batches: [] as Request[][],
        failure: "" as "" | "lost response" | "rejection",
        fetch: vi.fn(),
        onAuth: () => {},
        onBatch: () => {},
        records,
    };

    remote.fetch = vi.fn(async (input: string, options: RequestInit) => {
        const url = new URL(input);

        if (url.pathname.endsWith("/auth-with-password")) {
            remote.onAuth();

            return Response.json({
                record: { email: config.email, id: "owner" },
                token,
            });
        }

        if (url.pathname === "/api/batch") {
            const form = options.body as FormData;
            const { requests } = JSON.parse(
                String(form.get("@jsonPayload"))
            ) as { requests: Request[] };
            remote.batches.push(requests);
            remote.onBatch();
            const { failure } = remote;
            remote.failure = "";

            if (failure === "rejection") {
                return Response.json(
                    { message: "Batch rejected" },
                    { status: 400 }
                );
            }

            const staged = {
                artists: new Map(records.artists),
                snapshots: new Map(records.snapshots),
            };

            for (const request of requests) {
                const collection = request.url.includes("/artists/")
                    ? "artists"
                    : "snapshots";

                if (
                    request.method !== "POST" ||
                    staged[collection].has(request.body.id) ||
                    (collection === "snapshots" &&
                        !staged.artists.has(String(request.body.artist)))
                ) {
                    return Response.json(
                        { message: "Invalid batch order or duplicate" },
                        { status: 400 }
                    );
                }

                staged[collection].set(
                    request.body.id,
                    structuredClone(request.body)
                );
            }

            for (const collection of ["artists", "snapshots"] as const) {
                for (const [key, value] of staged[collection]) {
                    records[collection].set(key, value);
                }
            }

            if (failure === "lost response") {
                throw new Error("response lost");
            }

            return Response.json(
                requests.map((request) => ({ body: request.body, status: 200 }))
            );
        }

        const collection = url.pathname.includes("/artists/")
            ? "artists"
            : "snapshots";
        const filter = url.searchParams.get("filter") ?? "";
        // PocketBase v0.40.6 tools/search.Provider rejects filters over 3500 bytes.
        if (Buffer.byteLength(filter) > 3500) {
            return Response.json(
                {
                    message:
                        "Something went wrong while processing your request.",
                },
                { status: 400 }
            );
        }
        const ids = [...filter.matchAll(/\bid = "([^"]+)"/g)].map(
            (match) => match[1]
        );
        const spotifyIds = [...filter.matchAll(/spotifyId = "([^"]+)"/g)].map(
            (match) => match[1]
        );
        const artist = /artist = "([^"]+)"/.exec(filter)?.[1];
        const weeks = [...filter.matchAll(/weekStart = "([^"]+)"/g)].map(
            (match) => match[1]
        );
        const items = [...records[collection].values()].filter(
            (record) =>
                filter === "" ||
                ids.includes(record.id) ||
                spotifyIds.includes(String(record.spotifyId)) ||
                (record.artist === artist &&
                    weeks.includes(String(record.weekStart).replace("T", " ")))
        );

        const fields = url.searchParams.get("fields")?.split(",");
        return Response.json({
            items:
                fields == null
                    ? items
                    : items.map((record) =>
                          Object.fromEntries(
                              Object.entries(record).filter(([key]) =>
                                  fields.includes(key)
                              )
                          )
                      ),
            page: 1,
            perPage: 200,
            totalItems:
                url.searchParams.get("skipTotal") === "true"
                    ? -1
                    : items.length,
            totalPages:
                url.searchParams.get("skipTotal") === "true"
                    ? -1
                    : Math.ceil(items.length / 200),
        });
    });

    vi.stubGlobal("fetch", remote.fetch);

    return remote;
};
