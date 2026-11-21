import type { ArtistSnapshot, SnapshotResolution } from "@repo/common";
import {
    alignMonthlyFollowers,
    bucketSnapshots,
    snapshotBucket,
} from "@repo/common";
import { describe, expect, it } from "vitest";

type ResolutionCase = { expected: string; value: SnapshotResolution };

const snapshot = (
    id: string,
    timestamp: string,
    followers: null | number
): ArtistSnapshot => ({
    followers,
    id,
    popularity: null,
    timestamp,
});

describe("snapshot series", () => {
    it.each([
        { expected: "2026-01-01T00:00:00.000Z", value: "daily" },
        { expected: "2025-12-29T00:00:00.000Z", value: "weekly" },
        { expected: "2026-01-01T00:00:00.000Z", value: "monthly" },
        { expected: "2026-01-01T00:00:00.000Z", value: "quarterly" },
        { expected: "2026-01-01T00:00:00.000Z", value: "yearly" },
    ] satisfies ResolutionCase[])(
        "buckets $value in UTC across the year boundary",
        ({ expected, value }) => {
            const result = snapshotBucket("2025-12-31T20:00:00-05:00", value);

            expect(result).toBe(expected);
        }
    );

    it.each([
        { expected: "2026-08-17T00:00:00.000Z", value: "weekly" },
        { expected: "2026-08-01T00:00:00.000Z", value: "monthly" },
        { expected: "2026-07-01T00:00:00.000Z", value: "quarterly" },
        { expected: "2026-01-01T00:00:00.000Z", value: "yearly" },
    ] satisfies ResolutionCase[])(
        "buckets a summer capture at the start of its $value period",
        ({ expected, value }) => {
            const result = snapshotBucket("2026-08-19T16:00:00.000Z", value);

            expect(result).toBe(expected);
        }
    );

    it("selects the latest actual capture per artist/period and preserves its null metrics", () => {
        const rows = [
            {
                ...snapshot("a", "2026-01-05T00:00:00.000Z", 100),
                capturedAt: "2026-01-07T12:00:00.000Z",
            },
            {
                ...snapshot("a", "2026-01-12T00:00:00.000Z", null),
                capturedAt: "2026-01-13T12:00:00.000Z",
            },
            snapshot("b", "2026-01-19T00:00:00.000Z", 0),
        ];

        const result = bucketSnapshots([...rows].reverse(), "monthly");

        expect(result).toEqual([
            { ...rows[1], timestamp: "2026-01-01T00:00:00.000Z" },
            { ...rows[2], timestamp: "2026-01-01T00:00:00.000Z" },
        ]);
    });

    it("aligns sparse and disjoint histories with null gaps, including months absent from every series", () => {
        const rows = [
            snapshot("a", "2026-01-19T00:00:00.000Z", 10),
            snapshot("a", "2026-04-06T00:00:00.000Z", 0),
            snapshot("b", "2026-03-02T00:00:00.000Z", 20),
            snapshot("unselected", "2000-01-01T00:00:00.000Z", 999),
        ];

        const result = alignMonthlyFollowers(rows, ["a", "b", "no-history"]);

        expect(result.timestamps).toEqual([
            "2026-01-01T00:00:00.000Z",
            "2026-02-01T00:00:00.000Z",
            "2026-03-01T00:00:00.000Z",
            "2026-04-01T00:00:00.000Z",
        ]);
        expect(result.values).toEqual({
            a: [10, null, null, 0],
            b: [null, null, 20, null],
            "no-history": [null, null, null, null],
        });
    });

    it("handles empty histories and bounds chart allocations", () => {
        const empty = alignMonthlyFollowers([], ["a"]);
        const dates = [
            snapshot("a", "1900-01-01", 1),
            snapshot("a", "2026-01-01", 1),
        ];

        expect(empty).toEqual({ timestamps: [], values: { a: [] } });
        expect(() => alignMonthlyFollowers(dates, ["a"])).toThrow("100 years");
    });
});
