import { describe, expect, it } from "vitest";
import { historyWeeks, summarizeSongs } from "./song-history";

const rows = (counts: (null | number)[]) =>
    counts.map((listenCount, index) => ({
        capturedAt: new Date(Date.UTC(2026, 0, 6 + index * 7)).toISOString(),
        listenCount,
        name: "Song",
        spotifyId: "1".repeat(22),
        timestamp: new Date(Date.UTC(2026, 0, 5 + index * 7)).toISOString(),
    }));

describe("song history", () => {
    it("compares observed cumulative counts including measured zero", () => {
        expect(summarizeSongs(rows([0, 10, 30]), 0)[0]?.change).toBe(30);
    });

    it("does not invent changes for one observation or missing endpoints", () => {
        for (const counts of [[30], [null, 30], [30, null]]) {
            expect(summarizeSongs(rows(counts), 0)[0]?.change).toBeNull();
        }
    });

    it("compares sparse valid endpoints without filling missing observations", () => {
        const [result] = summarizeSongs(rows([10, null, 30]), 0);

        expect(result?.change).toBe(20);
        expect(result?.range[1]?.listenCount).toBeNull();
    });

    it("rejects a decrease even when the overall change is positive", () => {
        const [result] = summarizeSongs(rows([10, 5, 30]), 0);

        expect(result?.change).toBeNull();
        expect(result?.decreased).toBe(true);
    });

    it("only compares observations inside the range", () => {
        const history = rows([10, 20, 30]);

        expect(
            summarizeSongs(history, Date.parse(history[1]?.timestamp ?? ""))[0]
                ?.change
        ).toBe(10);
        expect(
            summarizeSongs(history, Date.parse(history[2]?.timestamp ?? ""))[0]
                ?.change
        ).toBeNull();
    });

    it("retains absent weeks between sparse observations", () => {
        const history = rows([10, null, 30]);

        expect(
            historyWeeks([
                history[0]?.timestamp ?? "",
                history[2]?.timestamp ?? "",
            ])
        ).toEqual(history.map((row) => row.timestamp));
        expect(historyWeeks([])).toEqual([]);
    });
});
