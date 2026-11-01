import type { ArtistSnapshotRow } from "@repo/common";
import { beforeEach, expect, test, vi } from "vitest";

const { all } = vi.hoisted(() => ({ all: vi.fn() }));
vi.mock("../database", () => ({ getDb: async () => ({ all }) }));
vi.mock("../spotify", () => ({ SpotifyClient: {} }));

import { ArtistService } from "./artist-service";

beforeEach(() => vi.resetAllMocks());

test("retains each artist's staggered observations and nullable new metrics", async () => {
    const rows: ArtistSnapshotRow[] = [
        { followers: 10, id: "a", popularity: 50, timestamp: 1800000000 },
        { followers: 10, id: "a", popularity: 50, timestamp: 1800000060 },
        {
            followers: 20,
            id: "b",
            monthly_listeners: 30,
            popularity: null,
            timestamp: 1800259200,
        },
    ];
    all.mockResolvedValue(rows);
    const result = await ArtistService.listArtistSnapshots({
        ids: ["a", "b"],
        resolution: "daily",
    });
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.id)).toEqual(["a", "b"]);
    expect(result[1]).toMatchObject({
        monthly_listeners: 30,
        popularity: null,
    });
});
