import { afterEach, describe, expect, it, vi } from "vitest";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistCache } from "./artist-cache";

type RecordData = {
    aliases: null | string[];
    displayName: string;
    id: string;
    spotifyId: string;
    syncEnabled: boolean;
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

const config = {
    email: "owner@example.com",
    password: "test-password",
    url: "http://pocketbase.invalid",
};

const token = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;

describe("ArtistCache", () => {
    it("builds with bounded keyset pages and queries the in-memory index without requests", async () => {
        const remote = source(501);
        const cache = new ArtistCache({
            client: new PocketBaseClient(config),
        });

        await cache.refresh();
        const calls = remote.fetch.mock.calls.length;

        expect(cache.search("Dustr")[0]?.name).toBe("Duster");
        expect(cache.coverage).toEqual({
            artists: 501,
            named: 501,
            unresolved: 0,
        });
        expect(remote.fetch).toHaveBeenCalledTimes(calls);
        expect(
            remote.filters.some((filter) =>
                filter.includes('id > "000000000000500"')
            )
        ).toBe(true);
        expect(remote.collections.includes("artists_with_snapshots")).toBe(
            true
        );
    });

    it("reconciles dashboard renames/deletions, missed notifications and restored records on a full refresh", async () => {
        const remote = source(1);
        const cache = new ArtistCache({
            client: new PocketBaseClient(config),
        });
        await cache.refresh();

        remote.records[0] = {
            ...record(1),
            aliases: ["Old alias"],
            displayName: "Renamed",
            syncEnabled: true,
        };
        remote.history.clear();

        await cache.refresh();

        expect(cache.search("Old alias")[0]).toMatchObject({
            hasHistory: false,
            name: "Renamed",
            syncEnabled: true,
        });
        expect(cache.search("Duster")).toEqual([]);

        remote.records = [];
        await cache.refresh();

        expect(cache.search("Renamed")).toEqual([]);

        remote.records = [record(1)];
        await cache.refresh();

        expect(cache.search("Dustr")[0]?.name).toBe("Duster");
    });

    it("shares refresh work and keeps the last complete index on failure or budget overflow", async () => {
        const remote = source(1);
        const cache = new ArtistCache({
            client: new PocketBaseClient(config),
            limits: { maxArtists: 1 },
        });
        const first = cache.refresh();

        expect(cache.refresh()).toBe(first);
        await first;

        remote.fail = true;
        await expect(cache.refresh()).rejects.toThrow();

        expect(cache.search("Dustr")[0]?.name).toBe("Duster");

        remote.fail = false;
        remote.records.push(record(2));
        await expect(cache.refresh()).rejects.toThrow("budget");

        expect(cache.coverage.artists).toBe(1);
    });

    it("rejects non-advancing pages without replacing the complete index", async () => {
        const remote = source(1);
        const cache = new ArtistCache({
            client: new PocketBaseClient(config),
        });
        await cache.refresh();

        remote.records = [record(2), record(1)];

        await expect(cache.refresh()).rejects.toThrow("pagination");
        expect(cache.search("Dustr")[0]?.name).toBe("Duster");
    });

    it("reports periodic failures and recovers on the next successful refresh", async () => {
        vi.useFakeTimers();
        const remote = source(1);
        const onError = vi.fn();
        const cache = new ArtistCache({
            client: new PocketBaseClient(config),
            refreshMs: 100,
        });
        await cache.start(onError);

        remote.fail = true;
        await vi.advanceTimersByTimeAsync(101);

        expect(onError).toHaveBeenCalledTimes(1);
        expect(cache.search("Dustr")[0]?.name).toBe("Duster");

        remote.fail = false;
        remote.records[0] = { ...record(1), displayName: "Recovered" };
        await vi.advanceTimersByTimeAsync(100);
        cache.stop();

        expect(cache.search("Recovered")[0]?.name).toBe("Recovered");
    });

    it("refreshes without notifications on its timer and stops cleanly", async () => {
        vi.useFakeTimers();
        const remote = source(1);
        const onError = vi.fn();
        const cache = new ArtistCache({
            client: new PocketBaseClient(config),
            refreshMs: 100,
        });
        await cache.start(onError);

        remote.records[0] = { ...record(1), displayName: "Changed" };
        await vi.advanceTimersByTimeAsync(101);

        expect(cache.search("Changed")[0]?.name).toBe("Changed");
        expect(onError).not.toHaveBeenCalled();

        cache.stop();
        const requests = remote.fetch.mock.calls.length;
        await vi.advanceTimersByTimeAsync(1000);

        expect(remote.fetch).toHaveBeenCalledTimes(requests);
    });
});

const record = (number: number): RecordData => ({
    aliases: [],
    displayName: number === 1 ? "Duster" : `Artist ${number}`,
    id: String(number).padStart(15, "0"),
    spotifyId: String(number).padStart(22, "0"),
    syncEnabled: false,
});

const source = (count: number) => {
    const state = {
        collections: [] as string[],
        fail: false,
        fetch: vi.fn(),
        filters: [] as string[],
        history: new Set([record(1).id]),
        records: Array.from({ length: count }, (_, index) => record(index + 1)),
    };

    state.fetch = vi.fn(async (url: string) => {
        if (url.includes("auth-with-password")) {
            return Response.json({ record: { id: "owner" }, token });
        }

        if (state.fail) {
            throw new Error("unavailable");
        }

        const query = new URL(url).searchParams;
        const collection = /collections\/([^/]+)\//.exec(url)?.[1] ?? "";
        state.collections.push(collection);
        const filter = query.get("filter") ?? "";
        state.filters.push(filter);
        const cursor = /id > "([^"]*)"/.exec(filter)?.[1] ?? "";
        const items = state.records
            .filter(
                (row) =>
                    row.id > cursor &&
                    (collection !== "artists_with_snapshots" ||
                        state.history.has(row.id))
            )
            .slice(0, 500);

        return Response.json({
            items,
            page: 1,
            perPage: 500,
            totalItems: -1,
            totalPages: -1,
        });
    });

    vi.stubGlobal("fetch", state.fetch);

    return state;
};
