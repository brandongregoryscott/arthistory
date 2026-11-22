import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    BackfillApp,
    DataRecord,
    PageResult,
} from "../../../../pocketbase/hooks/artist-sync-types";
import { collect, tick } from "../../../../pocketbase/hooks/artist-sync.js";

const ID = "6lcwlkAjBPSKnFBZjjZFJs";
const SONG = {
    listenCount: 123,
    name: "Sarah",
    spotifyId: "4HuiEuJ7ZW8jewUuZBg6sk",
};

class TestRecord implements DataRecord {
    id = "artist-record";
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
    const app: BackfillApp = {
        countRecords: () => 1,
        findCollectionByNameOrId: (name) => name,
        findFirstRecordByData: (name) =>
            name === "sync_settings" ? settings : state,
        findRecordById: () => artist,
        findRecordsByFilter: (name, _filter, _sort, _limit, _offset, params) =>
            name === "artists"
                ? [artist]
                : snapshots.filter(
                      (row) => row.getString("weekStart") === params?.week
                  ),
        runInTransaction: (operation) => operation(app),
        save: (row) => {
            if (
                row instanceof TestRecord &&
                row.collection === "snapshots" &&
                !snapshots.includes(row)
            ) {
                snapshots.push(row);
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
    return { advance, app, artist, dependencies, snapshots };
};

afterEach(() => vi.unstubAllGlobals());

describe("weekly song collection", () => {
    it("saves songs with artist metrics and replaces only the current week's complete list", () => {
        const { advance, app, artist, dependencies, snapshots } = setup();
        expect(collect(app, dependencies).status).toBe("collected");
        expect(dependencies.readPage).toHaveBeenCalledExactlyOnceWith(ID, 20);
        expect(snapshots[0]?.values).toMatchObject({
            artist: artist.id,
            capturedAt: "2026-11-18 12:00:00.000Z",
            followers: 10,
            songs: [SONG],
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
            songs: [],
            status: 200,
        });
        collect(app, dependencies);
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]?.values).toMatchObject({
            followers: 11,
            songs: [],
        });
        advance("2026-11-25T12:00:00Z");
        collect(app, dependencies);
        expect(snapshots).toHaveLength(2);
        expect(snapshots[0]?.getString("capturedAt")).toBe(
            "2026-11-19 12:00:00.000Z"
        );
    });

    it("keeps newer captures and their song list when an older result arrives", () => {
        const { advance, app, dependencies, snapshots } = setup();
        collect(app, dependencies);
        advance("2026-11-17T12:00:00Z", {
            displayName: "Alex G",
            metrics: { followers: 0, monthlyListeners: null, popularity: null },
            retryAfterMs: null,
            songs: [],
            status: 200,
        });
        collect(app, dependencies);
        expect(snapshots[0]?.values).toMatchObject({
            followers: 10,
            songs: [SONG],
        });
    });

    it("does not save snapshots for name backfill or failed page reads", () => {
        const { advance, app, dependencies, snapshots } = setup();
        expect(tick(app, dependencies).status).toBe("resolved");
        expect(snapshots).toEqual([]);
        advance("2026-11-19T12:00:00Z", {
            displayName: null,
            retryAfterMs: null,
            status: 429,
        });
        expect(collect(app, dependencies).status).toBe("failed");
        expect(snapshots).toEqual([]);
    });
});
