import { afterEach, describe, expect, it, vi } from "vitest";
import { PocketBaseClient } from "../storage/pocketbase";
import { ArtistSnapshotStore } from "./artist-snapshot-store";

const config = {
    email: "owner@example.com",
    password: "test-password",
    url: "http://pocketbase.invalid",
};
const token = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;
const artistId = (number: number) => String(number).padStart(22, "0");

const record = (number: number, artist = 1) => ({
    artist: String(artist).padStart(15, "0"),
    capturedAt: new Date(
        Date.UTC(2026, 0, 7 + (number - 1) * 7, 12, 34, 56)
    ).toISOString(),
    followers: -1,
    id: String(number).padStart(15, "0"),
    monthlyListeners: -1,
    popularity: 0,
    weekStart: new Date(Date.UTC(2026, 0, 5 + (number - 1) * 7)).toISOString(),
});

const remote = (records: ReturnType<typeof record>[]) => {
    const calls: URL[] = [];
    const artists = [
        ...new Map(
            records.map((row) => [
                row.artist,
                {
                    id: row.artist,
                    spotifyId: row.artist.padStart(22, "0"),
                },
            ])
        ).values(),
    ];
    const fetch = vi.fn(async (input: string) => {
        if (input.includes("auth-with-password")) {
            return Response.json({ record: { id: "owner" }, token });
        }
        const url = new URL(input);
        calls.push(url);
        const filter = url.searchParams.get("filter") ?? "";
        if (url.pathname.includes("/artists/")) {
            return Response.json({
                items: artists.filter((artist) =>
                    filter.includes(`spotifyId = "${artist.spotifyId}"`)
                ),
                page: 1,
                perPage: 50,
                totalItems: -1,
                totalPages: -1,
            });
        }
        const cursor = /weekStart > "([^"]*)"/.exec(filter)?.[1] ?? "";
        const artist = /artist = "([^"]*)"/.exec(filter)?.[1];
        const items =
            url.searchParams.get("sort") === "-capturedAt"
                ? [...records]
                      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
                      .slice(0, 1)
                : records
                      .filter(
                          (row) =>
                              row.artist === artist &&
                              (cursor === "" ||
                                  Date.parse(row.weekStart) >
                                      Date.parse(cursor))
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
    vi.stubGlobal("fetch", fetch);

    return { artists, calls, fetch };
};

afterEach(() => vi.unstubAllGlobals());

describe("ArtistSnapshotStore", () => {
    it("resolves artist identities before querying history through the artist/week index", async () => {
        const source = remote([record(1)]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        await store.list({ ids: [artistId(1)] });

        expect(source.calls[0]?.pathname).toBe(
            "/api/collections/artists/records"
        );
        const history = source.calls.find((url) =>
            url.pathname.includes("/snapshots/")
        );
        expect(history?.searchParams.get("filter")).toBe(
            'artist = "000000000000001"'
        );
        expect(history?.searchParams.get("sort")).toBe("weekStart");
        expect(history?.searchParams.has("expand")).toBe(false);
    });

    it("pages through more than 500 records and keeps independent histories with null metrics", async () => {
        const rows = Array.from({ length: 501 }, (_, index) => {
            const value = record(index + 1);
            const date = new Date(Date.UTC(2010, 0, 4 + index * 7));
            value.weekStart = date.toISOString();
            value.capturedAt = new Date(
                date.getTime() + 86400000
            ).toISOString();
            return value;
        });
        rows.push({
            ...record(502, 2),
            capturedAt: "2026-01-20T12:00:00.000Z",
            weekStart: "2026-01-19T00:00:00.000Z",
        });
        const source = remote(rows);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        const result = await store.list({
            ids: [artistId(1), artistId(2)],
            resolution: "weekly",
        });

        expect(result).toHaveLength(502);
        expect(result[0]).toMatchObject({
            followers: null,
            id: artistId(1),
            monthlyListeners: null,
            popularity: 0,
        });
        expect(result.at(-1)).toMatchObject({
            capturedAt: "2026-01-20T12:00:00.000Z",
            id: artistId(2),
            timestamp: "2026-01-19T00:00:00.000Z",
        });
        expect(source.calls).toHaveLength(4);
        expect(source.calls[2]?.searchParams.get("filter")).toContain(
            `weekStart > "${rows[499]?.weekStart}"`
        );
        expect(source.calls[0]?.searchParams.get("filter")).toContain(
            `spotifyId = "${artistId(2)}"`
        );
        expect(source.calls[1]?.searchParams.get("sort")).toBe("weekStart");
        expect(source.calls[0]?.searchParams.get("skipTotal")).toBe("true");
    });

    it("preserves measured zero and legacy popularity while translating only -1 to null", async () => {
        remote([
            {
                ...record(1),
                followers: 0,
                monthlyListeners: 123,
                popularity: 42,
            },
        ]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        expect(await store.list({ ids: [artistId(1)] })).toEqual([
            expect.objectContaining({
                followers: 0,
                monthlyListeners: 123,
                popularity: 42,
            }),
        ]);
    });

    it("preserves the latest complete capture within a month, including unavailable metrics", async () => {
        const first = record(1);
        first.followers = 100;
        const latest = {
            ...record(2),
            capturedAt: "2026-01-14 00:00:00.000Z",
            weekStart: "2026-01-12 00:00:00.000Z",
        };
        remote([first, latest]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        const result = await store.list({ ids: [artistId(1)] });

        expect(result).toEqual([
            {
                capturedAt: "2026-01-14T00:00:00.000Z",
                followers: null,
                id: artistId(1),
                monthlyListeners: null,
                popularity: 0,
                timestamp: "2026-01-01T00:00:00.000Z",
            },
        ]);
    });

    it("reports actual capture freshness instead of the bucket start and handles an empty database", async () => {
        const rows = [record(1)];
        const source = remote(rows);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        const latest = await store.latest();
        rows.length = 0;
        const empty = await store.latest();

        expect(latest).toEqual({ timestamp: "2026-01-07T12:34:56.000Z" });
        expect(empty).toBeUndefined();
        expect(source.calls[0]?.searchParams.get("sort")).toBe("-capturedAt");
    });

    it("rejects oversized requests and read results instead of returning truncated history", async () => {
        const source = remote([record(1), record(2)]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
            maxSnapshots: 1,
        });

        await expect(store.list({ ids: ["invalid"] })).rejects.toMatchObject({
            name: "ERROR_VALIDATION",
        });
        await expect(
            store.list({
                ids: Array.from({ length: 51 }, (_, index) =>
                    artistId(index + 1)
                ),
            })
        ).rejects.toMatchObject({ name: "ERROR_VALIDATION" });
        expect(source.fetch).not.toHaveBeenCalled();
        await expect(store.list({ ids: [artistId(1)] })).rejects.toThrow(
            "read limit"
        );
    });

    it("makes no requests for empty IDs and rejects missing artist relations", async () => {
        const row = record(1);
        const source = remote([row]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        expect(await store.list({ ids: [] })).toEqual([]);
        expect(source.fetch).not.toHaveBeenCalled();
        const originalFetch = source.fetch.getMockImplementation();
        source.fetch.mockImplementation(async (url: string) => {
            if (url.includes("/snapshots/")) {
                return Response.json({
                    items: [{ ...row, artist: "invalid" }],
                });
            }

            return originalFetch == null
                ? Response.error()
                : originalFetch(url);
        });
        await expect(store.list({ ids: [artistId(1)] })).rejects.toThrow(
            "artist relation"
        );
    });

    it("ignores unknown artists and deduplicates requested identities", async () => {
        const source = remote([record(1)]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        const result = await store.list({
            ids: [artistId(1), artistId(1), artistId(2)],
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.id).toBe(artistId(1));
        expect(source.calls).toHaveLength(2);
        expect(source.calls[0]?.searchParams.get("filter")).toBe(
            `spotifyId = "${artistId(1)}" || spotifyId = "${artistId(2)}"`
        );
    });

    it("fails a later-page transport error without returning partial history", async () => {
        const rows = Array.from({ length: 500 }, (_, index) =>
            record(index + 1)
        );
        const source = remote(rows);
        const originalFetch = source.fetch.getMockImplementation();
        source.fetch.mockImplementation(async (url: string) => {
            if (
                new URL(url).searchParams
                    .get("filter")
                    ?.includes('weekStart > "') === true
            ) {
                throw new Error("Later page unavailable");
            }

            return originalFetch == null
                ? Response.error()
                : originalFetch(url);
        });
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        await expect(store.list({ ids: [artistId(1)] })).rejects.toThrow();

        expect(source.fetch).toHaveBeenCalledTimes(4);
    });

    it("rejects non-advancing pagination", async () => {
        remote([record(2), record(1)]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        await expect(store.list({ ids: [artistId(1)] })).rejects.toThrow(
            "did not advance"
        );
    });

    it("reads chronological weeks even when record IDs sort in the opposite order", async () => {
        remote([
            { ...record(1), id: "zzzzzzzzzzzzzzz" },
            { ...record(2), id: "aaaaaaaaaaaaaaa" },
        ]);
        const store = new ArtistSnapshotStore({
            client: new PocketBaseClient(config),
        });

        const result = await store.list({
            ids: [artistId(1)],
            resolution: "weekly",
        });

        expect(result.map((row) => row.timestamp)).toEqual([
            "2026-01-05T00:00:00.000Z",
            "2026-01-12T00:00:00.000Z",
        ]);
    });
});
