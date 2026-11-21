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
        const weeks = [
            ...filter.matchAll(/artist = "([^"]+)" && weekStart = "([^"]+)"/g),
        ];
        const items = [...records[collection].values()].filter(
            (record) =>
                filter === "" ||
                ids.includes(record.id) ||
                spotifyIds.includes(String(record.spotifyId)) ||
                weeks.some(
                    (match) =>
                        record.artist === match[1] &&
                        String(record.weekStart).replace("T", " ") === match[2]
                )
        );

        return Response.json({
            items,
            page: 1,
            perPage: 200,
            totalItems: items.length,
            totalPages: Math.ceil(items.length / 200),
        });
    });

    vi.stubGlobal("fetch", remote.fetch);

    return remote;
};
