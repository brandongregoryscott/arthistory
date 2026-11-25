import { afterEach, describe, expect, it, vi } from "vitest";
import { PocketBaseClient } from "../storage/pocketbase";
import { SongSnapshotStore } from "./song-snapshot-store";

const ID = "1".repeat(22);

const ARTIST = "a".repeat(15);

const row = {
    artist: ARTIST,
    capturedAt: "2026-01-06",
    expand: { song: { spotifyId: "2".repeat(22) } },
    id: "b".repeat(15),
    listenCount: -1,
    name: "Historical title",
    song: "c".repeat(15),
    weekStart: "2026-01-05",
};

const config = {
    email: "owner@example.com",
    password: "test-password",
    url: "http://pocketbase.invalid",
};

const TOKEN = `test.${Buffer.from(JSON.stringify({ exp: 4000000000 })).toString("base64url")}.test`;

type TestRow = { expand: { song?: { spotifyId: string } } } & Omit<
    typeof row,
    "expand"
>;

const remote = (records: TestRow[], exists = true) => {
    const calls: URL[] = [];

    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string) => {
            if (input.includes("auth-with-password")) {
                return Response.json({ record: { id: "owner" }, token: TOKEN });
            }

            const url = new URL(input);
            const artistRecords = exists ? [{ id: ARTIST, spotifyId: ID }] : [];

            calls.push(url);

            const cursor =
                /id > "([^"]*)"/.exec(
                    url.searchParams.get("filter") ?? ""
                )?.[1] ?? "";
            const observations = records
                .filter((record) => record.id > cursor)
                .slice(0, 500);

            return Response.json({
                items: url.pathname.includes("/artists/")
                    ? artistRecords
                    : observations,
            });
        })
    );

    return calls;
};

describe("SongSnapshotStore", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("validates IDs before accessing storage", async () => {
        const fetch = vi.fn();

        vi.stubGlobal("fetch", fetch);

        for (const value of ["bad", "", "x' || true", [ID], undefined]) {
            await expect(
                new SongSnapshotStore(new PocketBaseClient(config)).list(
                    value as string
                )
            ).rejects.toMatchObject({ name: "ERROR_VALIDATION" });
            expect(fetch).not.toHaveBeenCalled();
        }
    });

    it("reads private history via artist relation and maps missing counts to null", async () => {
        const calls = remote([row]);
        const result = await new SongSnapshotStore(
            new PocketBaseClient(config)
        ).list(ID);

        expect(result).toEqual([
            {
                capturedAt: "2026-01-06T00:00:00.000Z",
                listenCount: null,
                name: "Historical title",
                spotifyId: "2".repeat(22),
                timestamp: "2026-01-05T00:00:00.000Z",
            },
        ]);
        expect(calls[1]?.searchParams.get("filter")).toContain(
            `artist = "${ARTIST}"`
        );
        expect(JSON.stringify(result)).not.toContain(ARTIST);
    });

    it("paginates observations sharing a week without dropping songs", async () => {
        const records = Array.from({ length: 501 }, (_, index) => ({
            ...row,
            expand: {
                song: { spotifyId: String(index + 1).padStart(22, "0") },
            },
            id: String(index + 1).padStart(15, "0"),
        }));
        const calls = remote(records);
        const result = await new SongSnapshotStore(
            new PocketBaseClient(config)
        ).list(ID);

        expect(result).toHaveLength(501);
        expect(calls).toHaveLength(3);
        expect(calls[2]?.searchParams.get("filter")).toContain(
            'id > "000000000000500"'
        );
    });

    it("preserves zero and empty history", async () => {
        remote([{ ...row, listenCount: 0 }]);
        expect(
            (
                await new SongSnapshotStore(new PocketBaseClient(config)).list(
                    ID
                )
            )[0]?.listenCount
        ).toBe(0);
        remote([]);
        expect(
            await new SongSnapshotStore(new PocketBaseClient(config)).list(ID)
        ).toEqual([]);
    });

    it("returns an empty history for an unknown artist", async () => {
        const calls = remote([], false);

        expect(
            await new SongSnapshotStore(new PocketBaseClient(config)).list(ID)
        ).toEqual([]);
        expect(calls).toHaveLength(1);
    });

    it("rejects invalid stored observations", async () => {
        for (const invalid of [
            { ...row, artist: "other" },
            { ...row, listenCount: -2 },
            { ...row, capturedAt: "bad" },
            { ...row, expand: {} },
        ]) {
            remote([invalid]);
            await expect(
                new SongSnapshotStore(new PocketBaseClient(config)).list(ID)
            ).rejects.toThrow("Invalid song observation");
        }
    });
});
