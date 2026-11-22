import type * as common from "@repo/common";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { hideEmptyFollowerMonths } from "./follower-chart";

// The shared package is CommonJS; load it through the Node test runner.
const { alignMonthlyFollowers }: typeof common = createRequire(import.meta.url)(
    "@repo/common"
);

const snapshot = (
    id: string,
    timestamp: string,
    followers: null | number
): common.ArtistSnapshot => ({ followers, id, popularity: null, timestamp });

const month = (date: string) => `${date}-01T00:00:00.000Z`;

test("compacts the sparse 2019–2026 history and leaves the full timeline intact", () => {
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
        dates.map((date, index) => snapshot("alex-g", month(date), index + 1)),
        ["alex-g"]
    );
    const original = structuredClone(full);
    const compact = hideEmptyFollowerMonths(full);

    assert.deepEqual(compact.timestamps, dates.map(month));
    assert.deepEqual(compact.values["alex-g"], [1, 2, 3, 4, 5, 6, 7]);
    assert.equal(full.timestamps.length, 85);
    assert.deepEqual(full, original);
});

test("keeps the union of selected artists' months, null alignment and zero observations", () => {
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

    assert.deepEqual(both, {
        timestamps: ["2025-01", "2025-03", "2025-05"].map(month),
        values: {
            a: [10, null, 0],
            b: [null, 20, null],
            empty: [null, null, null],
        },
    });
    assert.deepEqual(
        hideEmptyFollowerMonths(alignMonthlyFollowers(snapshots, ["a"])),
        {
            timestamps: ["2025-01", "2025-05"].map(month),
            values: { a: [10, 0] },
        }
    );
});

test("handles empty selections, empty histories, null-only histories and a single observation", () => {
    assert.deepEqual(hideEmptyFollowerMonths(alignMonthlyFollowers([], [])), {
        timestamps: [],
        values: {},
    });
    assert.deepEqual(
        hideEmptyFollowerMonths(alignMonthlyFollowers([], ["a"])),
        {
            timestamps: [],
            values: { a: [] },
        }
    );
    assert.deepEqual(
        hideEmptyFollowerMonths(
            alignMonthlyFollowers(
                [snapshot("a", month("2026-11"), null)],
                ["a"]
            )
        ),
        { timestamps: [], values: { a: [] } }
    );
    assert.deepEqual(
        hideEmptyFollowerMonths(
            alignMonthlyFollowers([snapshot("a", month("2026-11"), 0)], ["a"])
        ),
        { timestamps: [month("2026-11")], values: { a: [0] } }
    );
});
