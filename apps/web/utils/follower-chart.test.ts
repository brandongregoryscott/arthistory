import type { ArtistSnapshot } from "@repo/common";
import { alignMonthlyFollowers } from "@repo/common";
import { it, describe, expect } from "vitest";
import { hideEmptyFollowerMonths } from "./follower-chart";

const snapshot = (
    id: string,
    timestamp: string,
    followers: null | number
): ArtistSnapshot => ({ followers, id, popularity: null, timestamp });

const month = (date: string) => `${date}-01T00:00:00.000Z`;

describe("hideEmptyFollowerMonths", () => {
    it("compacts the sparse 2019-2026 history and leaves the full timeline intact", () => {
        const dates = [
            "2019-11",
            "2019-12",
            "2024-06",
            "2025-01",
            "2025-02",
            "2025-05",
            "2026-11",
        ];
        const full = alignMonthlyFollowers(
            dates.map((date, index) =>
                snapshot("alex-g", month(date), index + 1)
            ),
            ["alex-g"]
        );
        const original = structuredClone(full);
        const compact = hideEmptyFollowerMonths(full);

        expect(compact.timestamps).toStrictEqual(dates.map(month));
        expect(compact.values["alex-g"]).toStrictEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(full.timestamps).toHaveLength(85);
        expect(full).toStrictEqual(original);
    });

    it("keeps the union of selected artists' months, null alignment and zero observations", () => {
        const snapshots = [
            snapshot("a", month("2025-01"), 10),
            snapshot("a", month("2025-05"), 0),
            snapshot("b", month("2025-03"), 20),
            snapshot("b", month("2025-04"), null),
            snapshot("unselected", month("2025-02"), 999),
        ].reverse();
        const both = hideEmptyFollowerMonths(
            alignMonthlyFollowers(snapshots, ["a", "b", "empty"])
        );

        expect(both).toStrictEqual({
            timestamps: ["2025-01", "2025-03", "2025-05"].map(month),
            values: {
                a: [10, null, 0],
                b: [null, 20, null],
                empty: [null, null, null],
            },
        });
        expect(
            hideEmptyFollowerMonths(alignMonthlyFollowers(snapshots, ["a"]))
        ).toStrictEqual({
            timestamps: ["2025-01", "2025-05"].map(month),
            values: { a: [10, 0] },
        });
    });

    it("handles empty selections, empty histories, null-only histories and a single observation", () => {
        expect(
            hideEmptyFollowerMonths(alignMonthlyFollowers([], []))
        ).toStrictEqual({
            timestamps: [],
            values: {},
        });
        expect(
            hideEmptyFollowerMonths(alignMonthlyFollowers([], ["a"]))
        ).toStrictEqual({
            timestamps: [],
            values: { a: [] },
        });
        expect(
            hideEmptyFollowerMonths(
                alignMonthlyFollowers(
                    [snapshot("a", month("2026-11"), null)],
                    ["a"]
                )
            )
        ).toStrictEqual({ timestamps: [], values: { a: [] } });
        expect(
            hideEmptyFollowerMonths(
                alignMonthlyFollowers(
                    [snapshot("a", month("2026-11"), 0)],
                    ["a"]
                )
            )
        ).toStrictEqual({ timestamps: [month("2026-11")], values: { a: [0] } });
    });
});
