import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncApp, DataRecord, PageResult } from "./artist-sync.js";
import { collect, tick } from "./artist-sync.js";

const ID = "6lcwlkAjBPSKnFBZjjZFJs";

const SONG = {
    listenCount: 123,
    name: "Sarah",
    spotifyId: "4HuiEuJ7ZW8jewUuZBg6sk",
};

class TestRecord implements DataRecord {
    id = "";

    values: Record<string, unknown> = {};

    constructor(readonly collection: unknown) {}

    getBool(field: string) {
        return this.values[field] === true;
    }

    getInt(field: string) {
        return Number(this.values[field] ?? 0);
    }

    getString(field: string) {
        return String(this.values[field] ?? "");
    }

    original() {
        return this;
    }

    set(field: string, value: unknown) {
        this.values[field] = value;
    }
}

const setup = () => {
    const artist = new TestRecord("artists");

    artist.values = { spotifyId: ID, syncEnabled: true };

    const settings = new TestRecord("sync_settings");

    settings.values = {
        enabled: true,
        namesBackfillEnabled: true,
        requestIntervalSeconds: 15,
        requestTimeoutSeconds: 20,
    };

    const state = new TestRecord("sync_state");
    const snapshots: TestRecord[] = [];
    const songs: TestRecord[] = [];
    const songSnapshots: TestRecord[] = [];
    const tables: Record<string, TestRecord[]> = {
        artists: [artist],
        snapshots,
        song_snapshots: songSnapshots,
        songs,
    };

    const table = (name: string) => {
        const rows = tables[name];

        if (rows == null) {
            throw new Error(`Unknown table: ${name}`);
        }

        return rows;
    };

    artist.id = "artist-record";

    let sequence = 0;
    const app: SyncApp = {
        countRecords: () => 1,
        delete: (row) => {
            const rows = table(String((row as TestRecord).collection));

            rows.splice(rows.indexOf(row as TestRecord), 1);
        },
        findCollectionByNameOrId: (name) => name,
        findFirstRecordByData: (name) =>
            name === "sync_settings" ? settings : state,
        findRecordById: () => artist,
        findRecordsByFilter: (name, _filter, _sort, limit, _offset, params) => {
            const rows = table(name).filter(
                (row) =>
                    (params?.week == null ||
                        row.getString("weekStart") === params.week) &&
                    (params?.artist == null ||
                        row.getString("artist") === params.artist) &&
                    (params?.id == null ||
                        (name === "songs"
                            ? row.getString("spotifyId")
                            : row.id) === params.id)
            );

            return limit === 0 ? rows : rows.slice(0, limit);
        },
        runInTransaction: (operation) => {
            const saved = Object.values(tables)
                .flat()
                .concat(state, settings)
                .map((row) => ({ row, values: structuredClone(row.values) }));
            const contents = Object.fromEntries(
                Object.entries(tables).map((entry) => {
                    const [key, rows] = entry;

                    return [key, [...rows]];
                })
            );

            try {
                operation(app);
            } catch (error) {
                for (const { row, values } of saved) {
                    row.values = values;
                }

                for (const [key, rows] of Object.entries(contents)) {
                    table(key).splice(0, table(key).length, ...rows);
                }

                throw error;
            }
        },
        save: (row) => {
            if (
                row instanceof TestRecord &&
                tables[String(row.collection)] != null
            ) {
                const rows = table(String(row.collection));

                if (!rows.includes(row)) {
                    row.id = `record-${++sequence}`;
                    rows.push(row);
                }
            }
        },
    };

    vi.stubGlobal("Record", TestRecord);

    let now = Date.parse("2026-11-18T12:00:00Z");
    let page: PageResult = {
        displayName: "Alex G",
        metrics: { followers: 10, monthlyListeners: 20, popularity: null },
        retryAfterMs: null,
        songs: [SONG],
        status: 200,
    };
    const dependencies = {
        now: () => now,
        readPage: vi.fn(() => page),
        token: () => "claim",
    };

    const advance = (timestamp: string, nextPage = page) => {
        now = Date.parse(timestamp);
        page = nextPage;
        state.set("nextRequestAt", "");
    };

    return {
        advance,
        app,
        artist,
        dependencies,
        snapshots,
        songs,
        songSnapshots,
    };
};

describe("weekly song collection", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("stores queryable song identities and weekly observations using one artist-page read", () => {
        const {
            advance,
            app,
            artist,
            dependencies,
            snapshots,
            songs,
            songSnapshots,
        } = setup();

        expect(collect(app, dependencies).status).toBe("collected");
        expect(dependencies.readPage).toHaveBeenCalledExactlyOnceWith(ID, 20);
        expect(snapshots[0]?.values).toMatchObject({
            artist: artist.id,
            followers: 10,
        });
        expect(snapshots[0]?.values).not.toHaveProperty("songs");
        expect(songs).toHaveLength(1);
        expect(songs[0]?.values).toEqual({
            name: SONG.name,
            spotifyId: SONG.spotifyId,
        });
        expect(songSnapshots[0]?.values).toEqual({
            artist: artist.id,
            capturedAt: "2026-11-18 12:00:00.000Z",
            listenCount: 123,
            name: SONG.name,
            song: songs[0]?.id,
            source: "spotify-public-page",
            weekStart: "2026-11-16 00:00:00.000Z",
        });
        expect(artist.getString("nextAttemptAt")).toBe(
            "2026-11-23 00:00:00.000Z"
        );
        advance("2026-11-19T12:00:00Z", {
            displayName: "Alex G",
            metrics: {
                followers: 11,
                monthlyListeners: null,
                popularity: null,
            },
            retryAfterMs: null,
            songs: [{ ...SONG, listenCount: 0, name: "Renamed" }],
            status: 200,
        });
        collect(app, dependencies);
        expect(snapshots).toHaveLength(1);
        expect(songs).toHaveLength(1);
        expect(songs[0]?.getString("name")).toBe("Renamed");
        expect(songSnapshots).toHaveLength(1);
        expect(songSnapshots[0]?.values).toMatchObject({
            listenCount: 0,
            name: "Renamed",
        });
        advance("2026-11-25T12:00:00Z", {
            displayName: "Alex G",
            metrics: {
                followers: 12,
                monthlyListeners: null,
                popularity: null,
            },
            retryAfterMs: null,
            songs: [{ ...SONG, listenCount: null }],
            status: 200,
        });
        collect(app, dependencies);
        expect(snapshots).toHaveLength(2);
        expect(songs).toHaveLength(1);
        expect(songSnapshots).toHaveLength(2);
        expect(songSnapshots[0]?.values).toMatchObject({
            listenCount: 0,
            name: "Renamed",
        });
        expect(songSnapshots[1]?.values).toMatchObject({
            listenCount: -1,
            name: SONG.name,
        });
    });

    it.each([[], null])(
        "preserves earlier weeks and song identities when songs leave the page: %j",
        (list) => {
            const { advance, app, dependencies, songs, songSnapshots } =
                setup();

            collect(app, dependencies);
            advance("2026-11-25T12:00:00Z");
            collect(app, dependencies);
            expect(songSnapshots).toHaveLength(2);
            advance("2026-11-26T12:00:00Z", {
                displayName: "Alex G",
                metrics: {
                    followers: 11,
                    monthlyListeners: null,
                    popularity: null,
                },
                retryAfterMs: null,
                songs: list,
                status: 200,
            });
            collect(app, dependencies);
            expect(songs).toHaveLength(1);
            expect(songSnapshots).toHaveLength(1);
            expect(songSnapshots[0]?.getString("weekStart")).toBe(
                "2026-11-16 00:00:00.000Z"
            );
        }
    );

    it("keeps newer captures when an older result arrives", () => {
        const { advance, app, dependencies, snapshots, songSnapshots } =
            setup();

        collect(app, dependencies);
        advance("2026-11-17T12:00:00Z", {
            displayName: "Alex G",
            metrics: {
                followers: 0,
                monthlyListeners: null,
                popularity: null,
            },
            retryAfterMs: null,
            songs: [],
            status: 200,
        });
        collect(app, dependencies);
        expect(snapshots[0]?.values).toMatchObject({ followers: 10 });
        expect(songSnapshots[0]?.values).toMatchObject({
            listenCount: 123,
        });
    });

    it("shares song identity across artist pages while keeping independent observations", () => {
        const { advance, app, artist, dependencies, songs, songSnapshots } =
            setup();

        collect(app, dependencies);
        // Reuse the fixture artist selection to simulate another artist's claim.
        artist.id = "second-artist";
        advance("2026-11-19T12:00:00Z");
        collect(app, dependencies);
        expect(songs).toHaveLength(1);
        expect(songSnapshots).toHaveLength(2);
        expect(songSnapshots.map((row) => row.getString("artist"))).toEqual([
            "artist-record",
            "second-artist",
        ]);
        expect(songSnapshots.map((row) => row.getString("song"))).toEqual([
            songs[0]?.id,
            songs[0]?.id,
        ]);
    });

    it("rolls back artist metrics, song writes and success state if a song snapshot save fails", () => {
        const { app, artist, dependencies, snapshots, songs, songSnapshots } =
            setup();
        const { save } = app;

        app.save = (row) => {
            if ((row as TestRecord).collection === "song_snapshots") {
                throw new Error("storage failure");
            }

            save(row);
        };

        expect(() => collect(app, dependencies)).toThrow("storage failure");
        expect(snapshots).toEqual([]);
        expect(songs).toEqual([]);
        expect(songSnapshots).toEqual([]);
        expect(artist.getString("lastSuccessAt")).toBe("");
    });

    it("does not save song data for name backfill or failed page reads", () => {
        const { advance, app, dependencies, snapshots, songs, songSnapshots } =
            setup();

        expect(tick(app, dependencies).status).toBe("resolved");
        advance("2026-11-19T12:00:00Z", {
            displayName: null,
            retryAfterMs: null,
            status: 429,
        });
        expect(collect(app, dependencies).status).toBe("failed");
        expect(snapshots).toEqual([]);
        expect(songs).toEqual([]);
        expect(songSnapshots).toEqual([]);
    });
});
